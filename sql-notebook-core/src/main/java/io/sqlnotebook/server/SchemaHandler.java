package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistry;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.*;

/**
 * Handles GET /schema/{namespace} requests.
 *
 * Returns tables, columns, types, primary keys, and enriched foreign keys.
 * FK columns now include referencedTable and referencedColumn so the
 * frontend can draw ERD relationship lines without any extra requests.
 *
 * Column FK shape:
 * {
 *   "name": "ArtistId",
 *   "type": "INTEGER",
 *   "primaryKey": false,
 *   "foreignKey": true,
 *   "referencedTable":  "artists",
 *   "referencedColumn": "ArtistId"
 * }
 */
public class SchemaHandler extends HttpServlet {

    private final ConnectionRegistry registry;
    private final ObjectMapper mapper = new ObjectMapper();

    public SchemaHandler(ConnectionRegistry registry) {
        this.registry = registry;
    }

    /**
     * GET /schema/{namespace} — returns all tables and columns for the given namespace.
     * Dispatches to the appropriate schema fetcher based on the detected database type.
     * Returns 400 if no namespace is provided, 404 if unknown or ephemeral.
     */
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {

        String path = req.getPathInfo();
        if (path == null || path.equals("/")) {
            resp.setStatus(400);
            resp.getWriter().write("{\"error\":\"namespace required — use /schema/{namespace}\"}");
            return;
        }

        String namespace = path.substring(1);

        if (!registry.getNamespaces().contains(namespace)) {
            resp.setStatus(404);
            resp.getWriter().write("{\"error\":\"unknown namespace: " + namespace + "\"}");
            return;
        }

        if (registry.isEphemeral(namespace)) {
            resp.setStatus(404);
            resp.getWriter().write("{\"error\":\"schema not available for file sources\"}");
            return;
        }

        try (Connection conn = registry.getConnection(namespace)) {
            String dbType = detectType(conn);
            List<Map<String, Object>> tables = fetchSchema(conn, dbType);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("namespace", namespace);
            result.put("tables", tables);

            resp.setContentType("application/json");
            resp.setCharacterEncoding("UTF-8");
            resp.setStatus(200);
            mapper.writeValue(resp.getWriter(), result);

        } catch (Exception e) {
            resp.setStatus(500);
            resp.getWriter().write("{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    /** Returns the lowercase database product name from JDBC metadata (e.g. "postgresql", "sqlite"). */
    private String detectType(Connection conn) throws Exception {
        return conn.getMetaData().getDatabaseProductName().toLowerCase();
    }

    /**
     * Dispatches schema fetching to the appropriate implementation based on database type.
     * SQLite and Oracle use proprietary system tables; DuckDB uses information_schema with
     * restricted schema support; all others use the standard INFORMATION_SCHEMA queries.
     */
    private List<Map<String, Object>> fetchSchema(Connection conn, String dbType) throws Exception {
        if (dbType.contains("sqlite")) {
            return fetchSqliteSchema(conn);
        } else if (dbType.contains("oracle")) {
            return fetchOracleSchema(conn);
        } else if (dbType.contains("duckdb")) {
            return fetchDuckDbSchema(conn);
        } else {
            return fetchInformationSchema(conn, dbType);
        }
    }

    // INFORMATION_SCHEMA (MySQL, PostgreSQL, MSSQL)

    private List<Map<String, Object>> fetchInformationSchema(Connection conn, String dbType) throws Exception {
        String schemaName;
        if (dbType.contains("postgresql")) {
            schemaName = conn.getSchema();
            if (schemaName == null || schemaName.isEmpty()) schemaName = "public";
        } else {
            schemaName = conn.getCatalog();
            if (schemaName == null || schemaName.isEmpty()) schemaName = conn.getSchema();
        }

        // columns
        String columnSql = """
            SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.ORDINAL_POSITION
            FROM INFORMATION_SCHEMA.COLUMNS c
            WHERE c.TABLE_SCHEMA = ?
            ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
        """;

        // primary keys
        String pkSql = """
            SELECT ku.TABLE_NAME, ku.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
               AND tc.TABLE_SCHEMA    = ku.TABLE_SCHEMA
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
              AND tc.TABLE_SCHEMA = ?
        """;

        // foreign keys with referenced table + column
        // PostgreSQL needs REFERENTIAL_CONSTRAINTS join; MySQL/MSSQL have the
        // columns directly on KEY_COLUMN_USAGE.
        String fkSql = dbType.contains("postgresql") ? """
            SELECT
                ku.TABLE_NAME,
                ku.COLUMN_NAME,
                ku2.TABLE_NAME  AS REFERENCED_TABLE_NAME,
                ku2.COLUMN_NAME AS REFERENCED_COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
               AND tc.TABLE_SCHEMA    = ku.TABLE_SCHEMA
            JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
                ON rc.CONSTRAINT_NAME        = tc.CONSTRAINT_NAME
               AND rc.CONSTRAINT_SCHEMA      = tc.TABLE_SCHEMA
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku2
                ON ku2.CONSTRAINT_NAME  = rc.UNIQUE_CONSTRAINT_NAME
               AND ku2.CONSTRAINT_SCHEMA = rc.UNIQUE_CONSTRAINT_SCHEMA
               AND ku2.ORDINAL_POSITION = ku.ORDINAL_POSITION
            WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
              AND tc.TABLE_SCHEMA = ?
        """ : """
            SELECT
                ku.TABLE_NAME,
                ku.COLUMN_NAME,
                ku.REFERENCED_TABLE_NAME,
                ku.REFERENCED_COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
               AND tc.TABLE_SCHEMA    = ku.TABLE_SCHEMA
            WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
              AND tc.TABLE_SCHEMA = ?
              AND ku.REFERENCED_TABLE_NAME IS NOT NULL
        """;

        // collect PKs
        Set<String> primaryKeys = new HashSet<>();
        try (PreparedStatement ps = conn.prepareStatement(pkSql)) {
            ps.setString(1, schemaName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    primaryKeys.add(rs.getString("TABLE_NAME") + "." + rs.getString("COLUMN_NAME"));
                }
            }
        }

        // collect FKs with references
        // key = "tableName.columnName" → { referencedTable, referencedColumn }
        Map<String, FkRef> foreignKeys = new HashMap<>();
        try (PreparedStatement ps = conn.prepareStatement(fkSql)) {
            ps.setString(1, schemaName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String key = rs.getString("TABLE_NAME") + "." + rs.getString("COLUMN_NAME");
                    foreignKeys.put(key, new FkRef(
                            rs.getString("REFERENCED_TABLE_NAME"),
                            rs.getString("REFERENCED_COLUMN_NAME")
                    ));
                }
            }
        }

        // build table → columns map
        Map<String, List<Map<String, Object>>> tableMap = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement(columnSql)) {
            ps.setString(1, schemaName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String tableName  = rs.getString("TABLE_NAME");
                    String columnName = rs.getString("COLUMN_NAME");
                    String key        = tableName + "." + columnName;
                    FkRef  fkRef      = foreignKeys.get(key);

                    Map<String, Object> column = new LinkedHashMap<>();
                    column.put("name",       columnName);
                    column.put("type",       rs.getString("DATA_TYPE").toUpperCase());
                    column.put("primaryKey", primaryKeys.contains(key));
                    column.put("foreignKey", fkRef != null);
                    if (fkRef != null) {
                        column.put("referencedTable",  fkRef.table);
                        column.put("referencedColumn", fkRef.column);
                    }

                    tableMap.computeIfAbsent(tableName, k -> new ArrayList<>()).add(column);
                }
            }
        }

        return buildTableList(tableMap);
    }

    // SQLite

    private List<Map<String, Object>> fetchSqliteSchema(Connection conn) throws Exception {
        List<String> tables = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) tables.add(rs.getString("name"));
            }
        }

        Map<String, List<Map<String, Object>>> tableMap = new LinkedHashMap<>();

        for (String table : tables) {
            // PRAGMA foreign_key_list returns: id, seq, table, from, to, ...
            // "from" = local column, "table" = referenced table, "to" = referenced column
            Map<String, FkRef> fkMap = new HashMap<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "PRAGMA foreign_key_list(\"" + table + "\")")) {
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        fkMap.put(
                                rs.getString("from"),
                                new FkRef(rs.getString("table"), rs.getString("to"))
                        );
                    }
                }
            }

            List<Map<String, Object>> columns = new ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "PRAGMA table_info(\"" + table + "\")")) {
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        String  colName = rs.getString("name");
                        FkRef   fkRef   = fkMap.get(colName);

                        Map<String, Object> column = new LinkedHashMap<>();
                        column.put("name",       colName);
                        column.put("type",       rs.getString("type").toUpperCase());
                        column.put("primaryKey", rs.getInt("pk") > 0);
                        column.put("foreignKey", fkRef != null);
                        if (fkRef != null) {
                            column.put("referencedTable",  fkRef.table);
                            column.put("referencedColumn", fkRef.column);
                        }
                        columns.add(column);
                    }
                }
            }

            tableMap.put(table, columns);
        }

        return buildTableList(tableMap);
    }

    // Oracle

    private List<Map<String, Object>> fetchOracleSchema(Connection conn) throws Exception {
        String user = conn.getMetaData().getUserName().toUpperCase();

        Set<String> primaryKeys = new HashSet<>();
        try (PreparedStatement ps = conn.prepareStatement("""
            SELECT ac.TABLE_NAME, acc.COLUMN_NAME
            FROM ALL_CONSTRAINTS ac
            JOIN ALL_CONS_COLUMNS acc
                ON ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME AND ac.OWNER = acc.OWNER
            WHERE ac.CONSTRAINT_TYPE = 'P' AND ac.OWNER = ?
        """)) {
            ps.setString(1, user);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    primaryKeys.add(rs.getString("TABLE_NAME") + "." + rs.getString("COLUMN_NAME"));
                }
            }
        }

        // For Oracle: R-type constraint references a U/P constraint on another table
        Map<String, FkRef> foreignKeys = new HashMap<>();
        try (PreparedStatement ps = conn.prepareStatement("""
            SELECT
                ac.TABLE_NAME,
                acc.COLUMN_NAME,
                ac2.TABLE_NAME  AS REFERENCED_TABLE,
                acc2.COLUMN_NAME AS REFERENCED_COLUMN
            FROM ALL_CONSTRAINTS ac
            JOIN ALL_CONS_COLUMNS acc
                ON ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME AND ac.OWNER = acc.OWNER
            JOIN ALL_CONSTRAINTS ac2
                ON ac.R_CONSTRAINT_NAME = ac2.CONSTRAINT_NAME AND ac2.OWNER = ac.OWNER
            JOIN ALL_CONS_COLUMNS acc2
                ON ac2.CONSTRAINT_NAME = acc2.CONSTRAINT_NAME
               AND ac2.OWNER = acc2.OWNER
               AND acc2.POSITION = acc.POSITION
            WHERE ac.CONSTRAINT_TYPE = 'R' AND ac.OWNER = ?
        """)) {
            ps.setString(1, user);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String key = rs.getString("TABLE_NAME") + "." + rs.getString("COLUMN_NAME");
                    foreignKeys.put(key, new FkRef(
                            rs.getString("REFERENCED_TABLE"),
                            rs.getString("REFERENCED_COLUMN")
                    ));
                }
            }
        }

        Map<String, List<Map<String, Object>>> tableMap = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement("""
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_ID
            FROM ALL_TAB_COLUMNS WHERE OWNER = ?
            ORDER BY TABLE_NAME, COLUMN_ID
        """)) {
            ps.setString(1, user);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String tableName  = rs.getString("TABLE_NAME");
                    String columnName = rs.getString("COLUMN_NAME");
                    String key        = tableName + "." + columnName;
                    FkRef  fkRef      = foreignKeys.get(key);

                    Map<String, Object> column = new LinkedHashMap<>();
                    column.put("name",       columnName);
                    column.put("type",       rs.getString("DATA_TYPE").toUpperCase());
                    column.put("primaryKey", primaryKeys.contains(key));
                    column.put("foreignKey", fkRef != null);
                    if (fkRef != null) {
                        column.put("referencedTable",  fkRef.table);
                        column.put("referencedColumn", fkRef.column);
                    }

                    tableMap.computeIfAbsent(tableName, k -> new ArrayList<>()).add(column);
                }
            }
        }

        return buildTableList(tableMap);
    }

    // DuckDB — uses INFORMATION_SCHEMA but with 'main' schema and no FK support

    private List<Map<String, Object>> fetchDuckDbSchema(Connection conn) throws Exception {
        // DuckDB always uses 'main' as the default schema for file-based namespaces
        String columnSql = """
            SELECT table_name, column_name, data_type, ordinal_position
            FROM information_schema.columns
            WHERE table_schema = 'main'
            ORDER BY table_name, ordinal_position
        """;

        Map<String, List<Map<String, Object>>> tableMap = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement(columnSql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                String tableName  = rs.getString("table_name");
                String columnName = rs.getString("column_name");

                Map<String, Object> column = new LinkedHashMap<>();
                column.put("name",       columnName);
                column.put("type",       rs.getString("data_type").toUpperCase());
                column.put("primaryKey", false);
                column.put("foreignKey", false);

                tableMap.computeIfAbsent(tableName, k -> new ArrayList<>()).add(column);
            }
        }

        return buildTableList(tableMap);
    }

    // helpers

    private List<Map<String, Object>> buildTableList(Map<String, List<Map<String, Object>>> tableMap) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> entry : tableMap.entrySet()) {
            Map<String, Object> table = new LinkedHashMap<>();
            table.put("name",    entry.getKey());
            table.put("columns", entry.getValue());
            result.add(table);
        }
        return result;
    }

    /** Simple value holder for a foreign key reference. */
    private record FkRef(String table, String column) {}
}