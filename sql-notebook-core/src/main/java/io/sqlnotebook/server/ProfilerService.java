package io.sqlnotebook.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;

/**
 * Computes per-column statistics for a single table in a JDBC connection.
 *
 * DuckDB path:
 *   Uses DuckDB's native SUMMARIZE command which returns count, null_percentage,
 *   approx_unique, min, max, mean, and std in a single pass  -  fast and exact.
 *   Note: DuckDB renamed the average column from 'avg' -> 'mean' in v1.1.0.
 *   We detect the column name at runtime from ResultSetMetaData.
 *
 * Generic path (MySQL, Postgres, SQLite, ...):
 *   Runs one wide aggregation query: COUNT(*), per-column null count,
 *   COUNT(DISTINCT), MIN, and MAX.
 *   Identifier quoting is obtained from DatabaseMetaData.getIdentifierQuoteString()
 *   so that MySQL backtick quoting, PostgreSQL double-quote, etc. are all handled
 *   correctly without any per-database switch.
 *
 * Table discovery:
 *   discoverTable() is called by ProfileHandler when no table name is provided.
 *   For DuckDB it prefers the 'data' view then falls back to the first table in 'main'.
 *   For other engines it picks the first BASE TABLE alphabetically.
 */
public class ProfilerService {

    private static final Logger log = LoggerFactory.getLogger(ProfilerService.class);

    /**
     * Maximum rows scanned by the generic profiler.
     * For tables larger than this, statistics are computed on the first N rows
     * (a fast, ordered sequential sample). Total row count is always the exact
     * value from a separate COUNT(*) query; null% and distinct counts are
     * estimates derived from the sample.
     */
    private static final int SAMPLE_ROWS = 100_000;

    public record ColumnProfile(
            String name,
            String type,
            long   rowCount,
            long   nullCount,
            double nullPct,
            long   approxDistinct,
            String min,
            String max,
            String mean,   // empty string for non-DuckDB sources
            String std     // empty string for non-DuckDB sources
    ) {}

    /**
     * Returns the table name to profile when the caller doesn't specify one.
     * Returns null if no table can be discovered (empty schema).
     */
    public String discoverTable(Connection conn) throws SQLException {
        String product = product(conn);
        if (product.contains("duckdb")) return discoverDuckDbTable(conn);

        // SQLite has no INFORMATION_SCHEMA; use the standard JDBC metadata API instead.
        if (product.contains("sqlite")) return discoverViaJdbcMetadata(conn, null);

        String schema = product.contains("postgresql")
                ? (conn.getSchema() != null ? conn.getSchema() : "public")
                : conn.getCatalog();

        String sql = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES " +
                     "WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' " +
                     "ORDER BY TABLE_NAME LIMIT 1";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString(1) : null;
            }
        }
    }

    /**
     * Discovers the first table alphabetically using the standard JDBC
     * DatabaseMetaData.getTables() API. Used for databases that do not expose
     * INFORMATION_SCHEMA (e.g. SQLite).
     */
    private String discoverViaJdbcMetadata(Connection conn, String schema) throws SQLException {
        String first = null;
        try (ResultSet tables = conn.getMetaData().getTables(null, schema, "%", new String[]{"TABLE"})) {
            while (tables.next()) {
                String name = tables.getString("TABLE_NAME");
                if (first == null || name.compareTo(first) < 0) first = name;
            }
        }
        return first;
    }

    /**
     * Computes column profiles for {@code table} in the given connection.
     */
    public List<ColumnProfile> profile(Connection conn, String table) throws SQLException {
        if (product(conn).contains("duckdb")) return profileDuckDb(conn, table);
        return profileGeneric(conn, table);
    }

    // DuckDB  -  native SUMMARIZE

    private List<ColumnProfile> profileDuckDb(Connection conn, String table) throws SQLException {
        // Get total row count separately so we can compute null counts per column
        // Use id() to double-escape any embedded double-quotes in the table name.
        String quotedTable = id(table, "\"");
        long total = scalarLong(conn, "SELECT COUNT(*) FROM " + quotedTable);

        List<ColumnProfile> result = new ArrayList<>();
        try (Statement stmt = conn.createStatement();
             ResultSet rs   = stmt.executeQuery("SUMMARIZE SELECT * FROM " + quotedTable)) {

            // DuckDB renamed 'avg' -> 'mean' in v1.1.0. Detect at runtime.
            String avgCol = resolveColumn(rs.getMetaData(), "mean", "avg");

            while (rs.next()) {
                double nullPct   = rs.getDouble("null_percentage");
                // In DuckDB SUMMARIZE, 'count' is the total row count (same as total),
                // not the non-null count. Derive nullCount from null_percentage instead.
                long   nullCount = Math.round(total * nullPct / 100.0);
                result.add(new ColumnProfile(
                        rs.getString("column_name"),
                        rs.getString("column_type").toUpperCase(),
                        total,
                        nullCount,
                        nullPct,
                        rs.getLong("approx_unique"),
                        str(rs.getString("min")),
                        str(rs.getString("max")),
                        str(rs.getString(avgCol)),
                        str(rs.getString("std"))
                ));
            }
        }
        log.debug("[profiler] DuckDB SUMMARIZE: {} columns for table '{}'", result.size(), table);
        return result;
    }

    // Generic  -  one-pass aggregation with positional result access

    private List<ColumnProfile> profileGeneric(Connection conn, String table) throws SQLException {
        // Use the JDBC-standard identifier quote character for this database.
        // MySQL returns "`", PostgreSQL/SQLite/DuckDB return "\"".
        String  q       = quoteChar(conn);
        String  product = product(conn);

        // Step 1: discover column names + types via a zero-row query (always fast).
        List<String> names = new ArrayList<>();
        List<String> types = new ArrayList<>();
        try (Statement stmt = conn.createStatement();
             ResultSet rs   = stmt.executeQuery("SELECT * FROM " + id(table, q) + " WHERE 1=0")) {
            ResultSetMetaData meta = rs.getMetaData();
            for (int i = 1; i <= meta.getColumnCount(); i++) {
                names.add(meta.getColumnName(i));
                types.add(meta.getColumnTypeName(i).toUpperCase());
            }
        }
        if (names.isEmpty()) return List.of();

        // Step 2: exact total row count via a lightweight COUNT(*).
        // InnoDB uses the smallest available index  -  typically finishes in < 2s even for 100M rows.
        long total = scalarLong(conn, "SELECT COUNT(*) FROM " + id(table, q));

        // Step 3: build aggregation query.
        // For large tables, run over a LIMIT-bounded subquery to keep the query under ~5 s.
        // Null% and distinct counts become estimates; rowCount always reflects the true total.
        boolean sampled = total > SAMPLE_ROWS;
        String  source  = sampled ? sampleSource(product, id(table, q)) : id(table, q);

        StringBuilder sb = new StringBuilder("SELECT COUNT(*)");   // pos 1
        for (String name : names) {
            String col = id(name, q);
            sb.append(", SUM(CASE WHEN ").append(col).append(" IS NULL THEN 1 ELSE 0 END)");
            sb.append(", COUNT(DISTINCT ").append(col).append(")");
            sb.append(", MIN(").append(col).append(")");
            sb.append(", MAX(").append(col).append(")");
        }
        sb.append(" FROM ").append(source);

        List<ColumnProfile> result = new ArrayList<>();
        try (Statement stmt = conn.createStatement();
             ResultSet rs   = stmt.executeQuery(sb.toString())) {
            if (rs.next()) {
                long sampleSize = rs.getLong(1);   // = SAMPLE_ROWS when sampled, else total
                for (int i = 0; i < names.size(); i++) {
                    int    base        = 2 + i * 4;
                    long   sampleNulls = rs.getLong(base);
                    long   distinct    = rs.getLong(base + 1);
                    String min         = str(rs.getString(base + 2));
                    String max         = str(rs.getString(base + 3));
                    double nullPct     = sampleSize == 0 ? 0 : (sampleNulls * 100.0 / sampleSize);
                    // Estimate total null count from sample ratio; exact when not sampled.
                    long   nullCount   = sampled
                            ? Math.round(nullPct * total / 100.0)
                            : sampleNulls;
                    result.add(new ColumnProfile(
                            names.get(i), types.get(i),
                            total, nullCount, nullPct, distinct,
                            min, max, "", ""
                    ));
                }
            }
        }
        if (sampled) log.info("[profiler] sampled {} of {} rows for '{}'", SAMPLE_ROWS, total, table);
        log.debug("[profiler] generic: {} columns for table '{}'", result.size(), table);
        return result;
    }

    /**
     * Builds a derived-table expression that returns at most {@link #SAMPLE_ROWS} rows.
     * Uses LIMIT (MySQL, PostgreSQL, SQLite) or TOP (MSSQL), both inside a derived table
     * alias so the outer aggregation sees it as a plain FROM source.
     */
    private String sampleSource(String product, String quotedTable) {
        if (product.contains("microsoft sql server")) {
            // MSSQL: TOP N inside a derived table
            return "(SELECT TOP " + SAMPLE_ROWS + " * FROM " + quotedTable + ") AS __snb_s";
        }
        // MySQL, PostgreSQL, SQLite, Oracle 12c+, and most others support LIMIT
        return "(SELECT * FROM " + quotedTable + " LIMIT " + SAMPLE_ROWS + ") AS __snb_s";
    }

    // helpers

    private String discoverDuckDbTable(Connection conn) throws SQLException {
        // Prefer the 'data' view (standard alias created by DuckDbRegistrar / PinnedViewRegistry)
        String checkData = "SELECT table_name FROM information_schema.tables " +
                           "WHERE table_schema = 'main' AND table_name = 'data' LIMIT 1";
        try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(checkData)) {
            if (rs.next()) return "data";
        }
        // Fall back to first table alphabetically in main schema
        String firstTable = "SELECT table_name FROM information_schema.tables " +
                            "WHERE table_schema = 'main' ORDER BY table_name LIMIT 1";
        try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(firstTable)) {
            return rs.next() ? rs.getString(1) : null;
        }
    }

    /**
     * Returns the identifier quote character for the given connection.
     * JDBC standard: DatabaseMetaData.getIdentifierQuoteString() returns a space
     * if identifier quoting is not supported  -  we fall back to double-quote in that case.
     */
    private String quoteChar(Connection conn) throws SQLException {
        String q = conn.getMetaData().getIdentifierQuoteString();
        return (q == null || q.isBlank()) ? "\"" : q;
    }

    /**
     * Wraps an identifier in the given quote character, doubling any embedded
     * occurrences of that character to escape them.
     * e.g. id("my`col", "`") -> "`my``col`"
     */
    private String id(String identifier, String q) {
        return q + identifier.replace(q, q + q) + q;
    }

    /**
     * Scans ResultSetMetaData for the first matching column name from the
     * provided candidates (case-insensitive). Returns the first candidate by
     * default if none match  -  the caller's JDBC driver will then throw a clear
     * "column not found" error rather than a silent wrong value.
     */
    private String resolveColumn(ResultSetMetaData meta, String... candidates) throws SQLException {
        for (int c = 1; c <= meta.getColumnCount(); c++) {
            String col = meta.getColumnName(c);
            for (String candidate : candidates) {
                if (candidate.equalsIgnoreCase(col)) return candidate;
            }
        }
        return candidates[0]; // first candidate is the default / most recent name
    }

    private long scalarLong(Connection conn, String sql) throws SQLException {
        try (Statement stmt = conn.createStatement(); ResultSet rs = stmt.executeQuery(sql)) {
            return rs.next() ? rs.getLong(1) : 0L;
        }
    }

    private String product(Connection conn) throws SQLException {
        return conn.getMetaData().getDatabaseProductName().toLowerCase();
    }

    private String str(String s) {
        return s == null ? "" : s;
    }
}
