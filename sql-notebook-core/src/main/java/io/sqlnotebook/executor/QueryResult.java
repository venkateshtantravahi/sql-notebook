package io.sqlnotebook.executor;

import java.util.List;

/**
 * An immutable container for the outcome of a SQL execution.
 *
 * @param namespace       The database where the query was run.
 * @param sql             The original SQL statement.
 * @param columns         The list of column names (empty on failure).
 * @param rows            The data records retrieved (empty on failure).
 * @param executionTimeMs Time taken in milliseconds.
 * @param success         True if the query ran without exceptions.
 * @param errorMessage    The exception message if success is false.
 * @param truncated       True if the result was capped at the row limit.
 */
public record QueryResult(
        String namespace,
        String sql,
        List<String> columns,
        List<List<Object>> rows,
        long executionTimeMs,
        boolean success,
        String errorMessage,
        boolean truncated
) {
    public static QueryResult success(String namespace, String sql,
                                      List<String> columns, List<List<Object>> rows,
                                      long executionTimeMs, boolean truncated) {
        return new QueryResult(namespace, sql, columns, rows, executionTimeMs, true, null, truncated);
    }

    public static QueryResult failure(String namespace, String sql,
                                      long executionTimeMs, String errorMessage) {
        return new QueryResult(namespace, sql, List.of(), List.of(), executionTimeMs, false, errorMessage, false);
    }
}
