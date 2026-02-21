package io.sqlnotebook.executor;

import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.connection.ConnectionRegistryException;

import java.sql.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class QueryExecutor {

    private final ConnectionRegistry registry;
    private final ExecutorService threadPool;

    public QueryExecutor(ConnectionRegistry registry, int threadPoolSize) {
        this.registry = registry;
        this.threadPool = Executors.newFixedThreadPool(threadPoolSize);
    }

    public Future<QueryResult> execute(String namespace, String sql) throws ConnectionRegistryException {
        registry.validateNamespace(namespace);
        return threadPool.submit(() -> runQuery(namespace, sql));
    }

    public void shutdown() {
        threadPool.shutdown();
    }

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

    private List<String> extractColumns(ResultSet rs) throws SQLException {
        ResultSetMetaData meta  = rs.getMetaData();
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
