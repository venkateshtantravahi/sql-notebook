package io.sqlnotebook.server;

import io.sqlnotebook.executor.QueryResult;

public record QueryResponse(
        String cellId,
        String status,
        QueryResult result,
        String error
) {

    public static QueryResponse running(String cellId) {
        return new QueryResponse(cellId, "running", null, null);
    }

    public static QueryResponse done(String cellId, QueryResult result) {
        return new QueryResponse(cellId, "done", result, null);
    }

    public static QueryResponse error(String cellId, String message) {
        return new QueryResponse(cellId, "error", null, message);
    }
}
