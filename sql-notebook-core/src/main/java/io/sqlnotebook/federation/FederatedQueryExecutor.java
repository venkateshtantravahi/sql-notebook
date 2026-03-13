package io.sqlnotebook.federation;

import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.executor.QueryResult;
import org.apache.calcite.adapter.jdbc.JdbcSchema;
import org.apache.calcite.jdbc.CalciteConnection;
import org.apache.calcite.schema.SchemaPlus;
import org.apache.calcite.sql.SqlDialect;
import org.apache.calcite.sql.dialect.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Executes cross-namespace federated SQL queries using Apache Calcite.
 *
 * Routing contract (enforced by QueryWebsocket):
 *   A request with a null/blank namespace field is treated as federated.
 *   This executor detects which registered namespaces the SQL references,
 *   mounts them as Calcite JdbcSchema sub-schemas, and executes the query
 *   via Calcite's in-memory join engine.
 *
 * Namespace detection:
 *   Scans the SQL for `word.` prefixes and cross-references against the
 *   set of registered namespaces. At least 2 matches are required.
 *
 * Predicate pushdown:
 *   Each sub-schema is created with the correct SqlDialect for its source
 *   type so Calcite can generate valid SQL for pushdown (e.g. DuckDB
 *   double-quoted identifiers, PostgreSQL ANSI quoting, etc.).
 *
 * Limitations (v1):
 *   - In-memory join: large × large tables will be slow.
 *   - No cross-source writes (Calcite doesn't support federated DML).
 */
public class FederatedQueryExecutor {

    private static final Logger log = LoggerFactory.getLogger(FederatedQueryExecutor.class);

    // Matches `word.` — the word is a candidate namespace prefix
    private static final Pattern NAMESPACE_REF = Pattern.compile("\\b([a-zA-Z_][a-zA-Z0-9_]*)\\.");

    static {
        // Ensure Calcite's JDBC driver is registered with DriverManager.
        // It uses META-INF/services auto-registration, but an explicit forName
        // call is safer in fat-jar environments where service-loading may fail.
        try {
            Class.forName("org.apache.calcite.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            throw new ExceptionInInitializerError("Calcite JDBC driver not found on classpath");
        }
    }

    private final ConnectionRegistry registry;
    private final ExecutorService threadPool;

    public FederatedQueryExecutor(ConnectionRegistry registry) {
        this.registry = registry;
        // Virtual threads — each federated query may block on multiple JDBC sources
        this.threadPool = Executors.newVirtualThreadPerTaskExecutor();
    }

    /**
     * Submits a federated SQL query for asynchronous execution.
     *
     * @param sql The cross-namespace SQL to execute.
     * @return A {@link Future} containing the {@link QueryResult} when complete.
     */
    public Future<QueryResult> execute(String sql) {
        return threadPool.submit(() -> runFederated(sql));
    }

    /**
     * Scans {@code sql} for {@code word.} prefixes and returns those that
     * match a registered namespace. Made public for use in QueryWebsocket routing.
     *
     * @param sql        the SQL string to scan
     * @param registered the set of currently registered namespace names
     * @return ordered set of matched namespace names (insertion order)
     */
    public static Set<String> detectNamespaces(String sql, Set<String> registered) {
        Set<String> found = new LinkedHashSet<>();
        Matcher m = NAMESPACE_REF.matcher(sql);
        while (m.find()) {
            String prefix = m.group(1);
            if (registered.contains(prefix)) found.add(prefix);
        }
        return found;
    }

    /* ------------------------------------------------------------------ */
    /* private                                                              */
    /* ------------------------------------------------------------------ */

    private QueryResult runFederated(String sql) {
        long start = System.currentTimeMillis();
        try {
            Set<String> namespaces = detectNamespaces(sql, registry.getNamespaces());
            if (namespaces.size() < 2) {
                return QueryResult.failure(null, sql, 0,
                        "Federated query must reference at least 2 registered namespaces. " +
                        "Detected: " + namespaces + ". " +
                        "Use namespace.tableName or namespace.data syntax.");
            }

            Properties props = new Properties();
            props.setProperty("lex", "JAVA"); // preserve identifier case

            try (Connection conn = DriverManager.getConnection("jdbc:calcite:", props)) {
                CalciteConnection cc = conn.unwrap(CalciteConnection.class);
                SchemaPlus root = cc.getRootSchema();

                for (String ns : namespaces) {
                    DataSource ds = registry.getDataSource(ns);
                    ConnectionConfig config = registry.getConfig(ns);
                    SqlDialect dialect = dialectFor(config);
                    String schema = defaultSchema(config);
                    // JdbcSchema.create takes a SqlDialectFactory (functional interface);
                    // wrap our fixed dialect instance so it ignores the DatabaseMetaData arg.
                    JdbcSchema jdbcSchema = JdbcSchema.create(root, ns, ds, dm -> dialect, null, schema);
                    root.add(ns, jdbcSchema);
                }

                log.debug("[federation] executing across namespaces: {}", namespaces);

                try (Statement stmt = conn.createStatement();
                     ResultSet rs = stmt.executeQuery(sql)) {
                    List<String> columns = extractColumns(rs);
                    List<List<Object>> rows = extractRows(rs);
                    long elapsed = System.currentTimeMillis() - start;
                    log.debug("[federation] done in {}ms, {} rows", elapsed, rows.size());
                    return QueryResult.success(null, sql, columns, rows, elapsed);
                }
            }
        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - start;
            log.error("[federation] query failed after {}ms: {}", elapsed, e.getMessage(), e);
            return QueryResult.failure(null, sql, elapsed, e.getMessage());
        }
    }

    /**
     * Maps connection type to the best-matching Calcite SqlDialect for pushdown.
     * Correct dialect selection is critical for Parquet/DuckDB predicate pushdown —
     * DuckDB only skips row-groups when it actually receives a WHERE clause.
     */
    private SqlDialect dialectFor(ConnectionConfig config) {
        return switch (config.type()) {
            case "duckdb"                -> DuckDbSqlDialect.DEFAULT;
            case "postgresql"            -> PostgresqlSqlDialect.DEFAULT;
            case "mysql"                 -> MysqlSqlDialect.DEFAULT;
            case "microsoft-sql-server"  -> MssqlSqlDialect.DEFAULT;
            case "oracle"                -> OracleSqlDialect.DEFAULT;
            default                      -> AnsiSqlDialect.DEFAULT;
        };
    }

    /**
     * Returns the JDBC schema name Calcite should inspect when building the
     * sub-schema table list.  Narrows scope so Calcite doesn't scan every
     * schema in the database (important for PostgreSQL which has many system schemas).
     */
    private String defaultSchema(ConnectionConfig config) {
        return switch (config.type()) {
            case "duckdb"      -> "main";
            case "postgresql"  -> "public";
            default            -> null;
        };
    }

    private List<String> extractColumns(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        List<String> columns = new ArrayList<>();
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            columns.add(meta.getColumnName(i));
        }
        return columns;
    }

    private List<List<Object>> extractRows(ResultSet rs) throws SQLException {
        List<List<Object>> rows = new ArrayList<>();
        ResultSetMetaData meta = rs.getMetaData();
        int colCount = meta.getColumnCount();
        while (rs.next()) {
            List<Object> row = new ArrayList<>();
            for (int i = 1; i <= colCount; i++) {
                row.add(rs.getObject(i));
            }
            rows.add(row);
        }
        return rows;
    }
}
