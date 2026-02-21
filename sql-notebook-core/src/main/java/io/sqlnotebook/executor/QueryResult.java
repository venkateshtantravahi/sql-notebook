package io.sqlnotebook.executor;

import java.util.List;

public record QueryResult(
        String namespace,
        String sql,
        List<String> columns,
        List<List<Object>> rows,
        long executionTimeMs,
        boolean success,
        String errorMessage
) {
    public static QueryResult success(String namespace, String sql,
                                      List<String> columns, List<List<Object>> rows,
                                      long executionTimeMs) {
        return new QueryResult(namespace, sql, columns, rows, executionTimeMs, true, null);
    }

    public static QueryResult failure(String namespace, String sql,
                                      long executionTimeMs, String errorMessage) {
        return new QueryResult(namespace, sql, List.of(), List.of(), executionTimeMs, false, errorMessage);
    }
}
