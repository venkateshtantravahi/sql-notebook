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
 * Handles the asynchronous execution of SQL queries against registered databases.
 * It uses a fixed thread pool to manage concurrent execution and prevent thread exhaustion.
 */
public class QueryExecutor {

    private final ConnectionRegistry registry;
    private final ExecutorService threadPool;

    /**
     * Initializes the executor with a shared registry and a dedicated thread pool.
     *
     * @param registry       The source of database connections.
     * @param threadPoolSize The maximum number of concurrent queries allowed.
     */
    public QueryExecutor(ConnectionRegistry registry, int threadPoolSize) {
        this.registry = registry;
        this.threadPool = Executors.newFixedThreadPool(threadPoolSize);
    }

    /**
     * Submits a SQL query for asynchronous execution.
     *
     * @param namespace The database connection to use.
     * @param sql       The SQL string to execute.
     * @return A {@link Future} that will eventually contain the {@link QueryResult}.
     * @throws ConnectionRegistryException if the namespace is invalid.
     */
    public Future<QueryResult> execute(String namespace, String sql) throws ConnectionRegistryException {
        registry.validateNamespace(namespace);
        return threadPool.submit(() -> runQuery(namespace, sql));
    }

    /**
     * Initiates an orderly shutdown of the execution thread pool.
     */
    public void shutdown() {
        threadPool.shutdown();
    }

    /**
     * Internal logic for executing a query and capturing its results or errors.
     * Implements try-with-resources to ensure JDBC objects are closed automatically.
     */
    private QueryResult runQuery(String namespace, String sql) {
        long start = System.currentTimeMillis();
        try (Connection conn = registry.getConnection(namespace);
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {

            List<String> columns = extractColumns(rs);
            List<List<Object>> rows = extractRows(rs);
            long elapsed = System.currentTimeMillis() - start;
            return QueryResult.success(namespace, sql, columns, rows, elapsed);
        } catch (Exception e) {

            long elapsed = System.currentTimeMillis() - start;
            return QueryResult.failure(namespace, sql, elapsed, e.getMessage());
        }
    }

    /**
     * Uses ResultSet metadata to determine the column headers.
     */
    private List<String> extractColumns(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        List<String> columns = new ArrayList<>();
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            columns.add(meta.getColumnName(i));
        }
        return columns;
    }

    /**
     * Iterates through the ResultSet to transform SQL rows into a List of Lists.
     */
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
