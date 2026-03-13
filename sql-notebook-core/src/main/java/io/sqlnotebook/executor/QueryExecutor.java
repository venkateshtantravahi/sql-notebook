package io.sqlnotebook.executor;

import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.connection.ConnectionRegistryException;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * Handles asynchronous execution of SQL queries against registered databases.
 *
 * Uses a virtual-thread-per-task executor so JDBC blocking calls never pin
 * platform threads. Pool size is therefore unbounded but the HikariCP pools
 * in ConnectionRegistry act as the real concurrency gate.
 *
 * Row limit:
 *   Results are capped at ROW_LIMIT rows. When the cap is hit, QueryResult
 *   carries truncated=true so the frontend can show a warning banner.
 */
public class QueryExecutor {

    static final int ROW_LIMIT = 10_000;

    private final ConnectionRegistry registry;
    private final ExecutorService threadPool;

    public QueryExecutor(ConnectionRegistry registry) {
        this.registry   = registry;
        this.threadPool = Executors.newVirtualThreadPerTaskExecutor();
    }

    /**
     * Submits a SQL query for asynchronous execution.
     *
     * @param namespace The database namespace to run the query against.
     * @param sql       The SQL string to execute.
     * @return A {@link Future} containing the {@link QueryResult} when complete.
     * @throws ConnectionRegistryException if the namespace is not registered.
     */
    public Future<QueryResult> execute(String namespace, String sql) {
        registry.validateNamespace(namespace);
        return threadPool.submit(() -> runQuery(namespace, sql));
    }

    /**
     * Initiates an orderly shutdown of the thread pool.
     * In-flight queries will complete before the pool terminates.
     */
    public void shutdown() {
        threadPool.shutdown();
    }

    private QueryResult runQuery(String namespace, String sql) {
        long start = System.currentTimeMillis();
        try (Connection conn = registry.getConnection(namespace);
             Statement  stmt = conn.createStatement();
             ResultSet  rs   = stmt.executeQuery(sql)) {

            List<String>       columns   = extractColumns(rs);
            boolean[]          truncated = {false};
            List<List<Object>> rows      = extractRows(rs, truncated);
            long elapsed = System.currentTimeMillis() - start;
            return QueryResult.success(namespace, sql, columns, rows, elapsed, truncated[0]);

        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - start;
            return QueryResult.failure(namespace, sql, elapsed, e.getMessage());
        }
    }

    private List<String> extractColumns(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        List<String> columns = new ArrayList<>();
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            columns.add(meta.getColumnName(i));
        }
        return columns;
    }

    public static List<List<Object>> extractRows(ResultSet rs, boolean[] truncated) throws SQLException {
        List<List<Object>> rows = new ArrayList<>();
        ResultSetMetaData meta = rs.getMetaData();
        int colCount = meta.getColumnCount();
        while (rs.next()) {
            if (rows.size() >= ROW_LIMIT) {
                truncated[0] = true;
                break;
            }
            List<Object> row = new ArrayList<>();
            for (int i = 1; i <= colCount; i++) {
                row.add(rs.getObject(i));
            }
            rows.add(row);
        }
        return rows;
    }
}
