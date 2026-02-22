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
 * Returns the full schema for a namespace — tables, columns, types,
 * primary keys and foreign keys — by querying INFORMATION_SCHEMA
 * or database-specific equivalents.
 */
public class SchemaHandler extends HttpServlet {

    private final ConnectionRegistry registry;
    private final ObjectMapper mapper = new ObjectMapper();

    public SchemaHandler(ConnectionRegistry registry) {
        this.registry = registry;
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        // Extract namespace from path: /schema/{namespace}
        String path = req.getPathInfo();
        if (path == null || path.equals("/")) {
            resp.setStatus(400);
            resp.getWriter().write("{\\\"error\\\":\\\"namespace required — use /schema/{namespace}\\\"}");
            return;
        }

        String namespace = path.substring(1); // strip leading /

        if (!registry.getNamespaces().contains(namespace)) {
            resp.setStatus(404);
            resp.getWriter().write("{\"error\":\"unknown namespace: " + namespace + "\"}");
            return;
        }

        try (Connection conn = registry.getConnection(namespace)) {
            String dbType = detectType(conn);
            List<Map<String, Object>> tables = fetchSchema(conn, dbType);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("namespace", namespace);
            result.put("tables", tables);

            resp.setContentType("application/json");
            resp.setStatus(200);
            mapper.writeValue(resp.getWriter(), result);

        } catch (Exception e) {
            resp.setStatus(500);
            resp.getWriter().write("{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    /**
     * Detects the database type from the JDBC connection metadata.
     * Returns a normalised lowercase string: mysql, postgresql, sqlite,
     * microsoft sql server, or oracle.
     */
    private String detectType(Connection conn) throws Exception {
        return conn.getMetaData()
                .getDatabaseProductName()
                .toLowerCase();
    }

    /**
     * Dispatches to the correct schema fetch strategy based on DB type.
     */
    private List<Map<String, Object>> fetchSchema(Connection conn, String dbType) throws Exception {
        if (dbType.contains("sqlite")) {
            return fetchSqliteSchema(conn);
        } else if (dbType.contains("oracle")) {
            return fetchOracleSchema(conn);
        } else {
            // MySQL, PostgreSQL, MSSQL all support INFORMATION_SCHEMA
            return fetchInformationSchema(conn, dbType);
        }
    }

    /**
     * Fetches schema using INFORMATION_SCHEMA — works for MySQL, PostgreSQL, MSSQL.
     */
    private List<Map<String, Object>> fetchInformationSchema(Connection conn, String dbType) throws Exception {
        // Get current database/schema name
        String schemaName = null;
        if (dbType.contains("postgresql")) {
            schemaName = conn.getSchema();
            if (schemaName == null || schemaName.isEmpty()) {
                schemaName = "public";
            }
        } else {
            schemaName = conn.getCatalog();
            if (schemaName == null || schemaName.isEmpty()) {
                schemaName = conn.getSchema();
            }
        }

        // Fetch all columns grouped by table
        String columnSql = """
            SELECT
                c.TABLE_NAME,
                c.COLUMN_NAME,
                c.DATA_TYPE,
                c.ORDINAL_POSITION
            FROM INFORMATION_SCHEMA.COLUMNS c
            WHERE c.TABLE_SCHEMA = ?
            ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
        """;

        // Fetch primary key columns
        String pkSql = """
            SELECT
                ku.TABLE_NAME,
                ku.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            AND tc.TABLE_SCHEMA = ?
        """;

        // Fetch foreign key columns
        String fkSql = """
            SELECT
                ku.TABLE_NAME,
                ku.COLUMN_NAME
            FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
            JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
            WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
            AND tc.TABLE_SCHEMA = ?
        """;

        // Collect primary keys
        Set<String> primaryKeys = new HashSet<>();
        try (PreparedStatement ps = conn.prepareStatement(pkSql)) {
            ps.setString(1, schemaName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    primaryKeys.add(rs.getString("TABLE_NAME") + "." + rs.getString("COLUMN_NAME"));
                }
            }
        }

        // Collect foreign keys
        Set<String> foreignKeys = new HashSet<>();
        try (PreparedStatement ps = conn.prepareStatement(fkSql)) {
            ps.setString(1, schemaName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    foreignKeys.add(rs.getString("TABLE_NAME") + "." + rs.getString("COLUMN_NAME"));
                }
            }
        }

        // Build table → columns map
        Map<String, List<Map<String, Object>>> tableMap = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement(columnSql)) {
            ps.setString(1, schemaName);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String tableName = rs.getString("TABLE_NAME");
                    String columnName = rs.getString("COLUMN_NAME");
                    String key = tableName + "." + columnName;

                    Map<String, Object> column = new LinkedHashMap<>();
                    column.put("name", columnName);
                    column.put("type", rs.getString("DATA_TYPE").toUpperCase());
                    column.put("primaryKey", primaryKeys.contains(key));
                    column.put("foreignKey", foreignKeys.contains(key));

                    tableMap.computeIfAbsent(tableName, k -> new ArrayList<>()).add(column);
                }
            }
        }

        return buildTableList(tableMap);
    }

    /**
     * Fetches schema for SQLite using PRAGMA commands.
     * SQLite has no INFORMATION_SCHEMA — each table must be queried individually.
     */
    private List<Map<String, Object>> fetchSqliteSchema(Connection conn) throws Exception {
        // Get all user tables
        List<String> tables = new ArrayList<>();
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    tables.add(rs.getString("name"));
                }
            }
        }

        Map<String, List<Map<String, Object>>> tableMap = new LinkedHashMap<>();

        for (String table : tables) {
            // Get foreign keys for this table
            Set<String> foreignKeyColumns = new HashSet<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "PRAGMA foreign_key_list(\"" + table + "\")")) {
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        foreignKeyColumns.add(rs.getString("from"));
                    }
                }
            }

            // Get columns for this table
            List<Map<String, Object>> columns = new ArrayList<>();
            try (PreparedStatement ps = conn.prepareStatement(
                    "PRAGMA table_info(\"" + table + "\")")) {
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        String colName = rs.getString("name");
                        Map<String, Object> column = new LinkedHashMap<>();
                        column.put("name", colName);
                        column.put("type", rs.getString("type").toUpperCase());
                        column.put("primaryKey", rs.getInt("pk") > 0);
                        column.put("foreignKey", foreignKeyColumns.contains(colName));
                        columns.add(column);
                    }
                }
            }

            tableMap.put(table, columns);
        }

        return buildTableList(tableMap);
    }

    /**
     * Fetches schema for Oracle using ALL_TAB_COLUMNS and ALL_CONSTRAINTS.
     */
    private List<Map<String, Object>> fetchOracleSchema(Connection conn) throws Exception {
        String user = conn.getMetaData().getUserName().toUpperCase();

        Set<String> primaryKeys = new HashSet<>();
        try (PreparedStatement ps = conn.prepareStatement("""
            SELECT ac.TABLE_NAME, acc.COLUMN_NAME
            FROM ALL_CONSTRAINTS ac
            JOIN ALL_CONS_COLUMNS acc
                ON ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME
                AND ac.OWNER = acc.OWNER
            WHERE ac.CONSTRAINT_TYPE = 'P'
            AND ac.OWNER = ?
        """)) {
            ps.setString(1, user);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    primaryKeys.add(rs.getString("TABLE_NAME") + "." + rs.getString("COLUMN_NAME"));
                }
            }
        }

        Set<String> foreignKeys = new HashSet<>();
        try (PreparedStatement ps = conn.prepareStatement("""
            SELECT ac.TABLE_NAME, acc.COLUMN_NAME
            FROM ALL_CONSTRAINTS ac
            JOIN ALL_CONS_COLUMNS acc
                ON ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME
                AND ac.OWNER = acc.OWNER
            WHERE ac.CONSTRAINT_TYPE = 'R'
            AND ac.OWNER = ?
        """)) {
            ps.setString(1, user);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    foreignKeys.add(rs.getString("TABLE_NAME") + "." + rs.getString("COLUMN_NAME"));
                }
            }
        }

        Map<String, List<Map<String, Object>>> tableMap = new LinkedHashMap<>();
        try (PreparedStatement ps = conn.prepareStatement("""
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_ID
            FROM ALL_TAB_COLUMNS
            WHERE OWNER = ?
            ORDER BY TABLE_NAME, COLUMN_ID
        """)) {
            ps.setString(1, user);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    String tableName = rs.getString("TABLE_NAME");
                    String columnName = rs.getString("COLUMN_NAME");
                    String key = tableName + "." + columnName;

                    Map<String, Object> column = new LinkedHashMap<>();
                    column.put("name", columnName);
                    column.put("type", rs.getString("DATA_TYPE").toUpperCase());
                    column.put("primaryKey", primaryKeys.contains(key));
                    column.put("foreignKey", foreignKeys.contains(key));

                    tableMap.computeIfAbsent(tableName, k -> new ArrayList<>()).add(column);
                }
            }
        }

        return buildTableList(tableMap);
    }

    /**
     * Converts the internal tableMap structure into the JSON-serialisable list format.
     */
    private List<Map<String, Object>> buildTableList(Map<String, List<Map<String, Object>>> tableMap) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, List<Map<String, Object>>> entry : tableMap.entrySet()) {
            Map<String, Object> table = new LinkedHashMap<>();
            table.put("name", entry.getKey());
            table.put("columns", entry.getValue());
            result.add(table);
        }
        return result;
    }
}
