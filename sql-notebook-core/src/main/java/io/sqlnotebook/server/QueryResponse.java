package io.sqlnotebook.server;

import io.sqlnotebook.executor.QueryResult;

/**
 * Data transfer object representing a status update or result sent to the client.
 *
 * @param cellId The ID of the notebook cell that triggered the query.
 * @param status The current state of execution ("running", "done", "error").
 * @param result The actual SQL result data (only present if status is "done").
 * @param error  The error message (only present if status is "error").
 */
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
