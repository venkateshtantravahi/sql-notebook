package io.sqlnotebook.federation;

import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.executor.QueryExecutor;
import io.sqlnotebook.executor.QueryResult;
import org.apache.calcite.adapter.jdbc.JdbcSchema;
import org.apache.calcite.jdbc.CalciteConnection;
import org.apache.calcite.schema.SchemaPlus;
import org.apache.calcite.sql.SqlDialect;
import org.apache.calcite.sql.dialect.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.io.File;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Executes cross-namespace federated SQL queries.
 *
 * Two execution paths:
 *
 *   Fast path — DuckDB ATTACH:
 *     When every referenced namespace is a local DuckDB file, we open a
 *     fresh in-process DuckDB connection, ATTACH each .db file READ_ONLY,
 *     and execute the user's SQL directly. DuckDB handles the join inside
 *     its columnar engine — no Java-side in-memory merge, full predicate
 *     pushdown, and row-group skipping on Parquet sources.
 *
 *   Slow path — Apache Calcite:
 *     Used when namespaces span different engine types (e.g. DuckDB + Postgres).
 *     Calcite builds a virtual schema from each JdbcSchema and executes an
 *     in-memory federated join.
 *
 * Namespace detection:
 *   Scans the SQL for `word.` prefixes and cross-references against the
 *   set of registered namespaces. At least 2 matches are required.
 */
public class FederatedQueryExecutor {

    private static final Logger log = LoggerFactory.getLogger(FederatedQueryExecutor.class);

    private static final Pattern NAMESPACE_REF = Pattern.compile("\\b([a-zA-Z_][a-zA-Z0-9_]*)\\.");

    static {
        try {
            Class.forName("org.apache.calcite.jdbc.Driver");
        } catch (ClassNotFoundException e) {
            throw new ExceptionInInitializerError("Calcite JDBC driver not found on classpath");
        }
    }

    private final ConnectionRegistry registry;
    private final ExecutorService threadPool;

    public FederatedQueryExecutor(ConnectionRegistry registry) {
        this.registry   = registry;
        this.threadPool = Executors.newVirtualThreadPerTaskExecutor();
    }

    public Future<QueryResult> execute(String sql) {
        return threadPool.submit(() -> runFederated(sql));
    }

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

            // Fast path: all local DuckDB files → native ATTACH (vectorized, no Java-side join)
            if (allLocalDuckDb(namespaces)) {
                log.debug("[federation] fast path: DuckDB ATTACH for namespaces={}", namespaces);
                return runDuckDbAttach(sql, namespaces, start);
            }

            // Slow path: cross-engine → Calcite in-memory join
            log.debug("[federation] slow path: Calcite for namespaces={}", namespaces);
            return runCalcite(sql, namespaces, start);

        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - start;
            log.error("[federation] query failed after {}ms: {}", elapsed, e.getMessage(), e);
            return QueryResult.failure(null, sql, elapsed, e.getMessage());
        }
    }

    /**
     * Returns true when every namespace is a DuckDB type whose database
     * field points to an existing local .db file — safe to ATTACH.
     */
    private boolean allLocalDuckDb(Set<String> namespaces) {
        return namespaces.stream().allMatch(ns -> {
            ConnectionConfig c = registry.getConfig(ns);
            return "duckdb".equals(c.type()) && new File(c.database()).exists();
        });
    }

    /**
     * Fast-path: ATTACH each namespace's .db file into a fresh in-process
     * DuckDB connection and execute the SQL directly. The user's SQL needs
     * no rewriting — DuckDB resolves `ns.data` as `attached_db.main.data`.
     */
    private QueryResult runDuckDbAttach(String sql, Set<String> namespaces, long start) {
        try (Connection conn = DriverManager.getConnection("jdbc:duckdb:")) {
            try (Statement stmt = conn.createStatement()) {
                for (String ns : namespaces) {
                    String dbPath = registry.getConfig(ns).database();
                    stmt.execute("ATTACH '%s' AS \"%s\" (READ_ONLY)".formatted(dbPath, ns));
                }
            }
            try (Statement stmt = conn.createStatement();
                 ResultSet  rs   = stmt.executeQuery(sql)) {
                List<String>       columns   = extractColumns(rs);
                boolean[]          truncated = {false};
                List<List<Object>> rows      = QueryExecutor.extractRows(rs, truncated);
                long elapsed = System.currentTimeMillis() - start;
                log.debug("[federation/attach] done in {}ms, {} rows, truncated={}", elapsed, rows.size(), truncated[0]);
                return QueryResult.success(null, sql, columns, rows, elapsed, truncated[0]);
            }
        } catch (SQLException e) {
            long elapsed = System.currentTimeMillis() - start;
            log.warn("[federation/attach] failed ({}), falling back to Calcite", e.getMessage());
            // Fall back to Calcite rather than surfacing a confusing internal error
            return runCalcite(sql, namespaces, start);
        }
    }

    /**
     * Slow-path: builds a Calcite root schema from each namespace's DataSource
     * and executes the federated SQL via Calcite's in-memory join engine.
     */
    private QueryResult runCalcite(String sql, Set<String> namespaces, long start) {
        Properties props = new Properties();
        props.setProperty("lex", "JAVA");

        try (Connection conn = DriverManager.getConnection("jdbc:calcite:", props)) {
            CalciteConnection cc   = conn.unwrap(CalciteConnection.class);
            SchemaPlus        root = cc.getRootSchema();

            for (String ns : namespaces) {
                DataSource     ds      = registry.getDataSource(ns);
                ConnectionConfig config = registry.getConfig(ns);
                SqlDialect     dialect = dialectFor(config);
                String         schema  = defaultSchema(config);
                JdbcSchema jdbcSchema = JdbcSchema.create(root, ns, ds, dm -> dialect, null, schema);
                root.add(ns, jdbcSchema);
            }

            try (Statement stmt = conn.createStatement();
                 ResultSet rs   = stmt.executeQuery(sql)) {
                List<String>       columns   = extractColumns(rs);
                boolean[]          truncated = {false};
                List<List<Object>> rows      = QueryExecutor.extractRows(rs, truncated);
                long elapsed = System.currentTimeMillis() - start;
                log.debug("[federation/calcite] done in {}ms, {} rows, truncated={}", elapsed, rows.size(), truncated[0]);
                return QueryResult.success(null, sql, columns, rows, elapsed, truncated[0]);
            }
        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - start;
            log.error("[federation/calcite] failed after {}ms: {}", elapsed, e.getMessage(), e);
            return QueryResult.failure(null, sql, elapsed, e.getMessage());
        }
    }

    private SqlDialect dialectFor(ConnectionConfig config) {
        return switch (config.type()) {
            case "duckdb"               -> DuckDbSqlDialect.DEFAULT;
            case "postgresql"           -> PostgresqlSqlDialect.DEFAULT;
            case "mysql"                -> MysqlSqlDialect.DEFAULT;
            case "microsoft-sql-server" -> MssqlSqlDialect.DEFAULT;
            case "oracle"               -> OracleSqlDialect.DEFAULT;
            default                     -> AnsiSqlDialect.DEFAULT;
        };
    }

    private String defaultSchema(ConnectionConfig config) {
        return switch (config.type()) {
            case "duckdb"     -> "main";
            case "postgresql" -> "public";
            default           -> null;
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
}
