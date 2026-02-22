package io.sqlnotebook.server;

/**
 * Data transfer object for an incoming query request.
 *
 * @param cellId    Optional identifier for the UI cell requesting the data.
 * @param namespace The target database namespace.
 * @param sql       The SQL statement to execute.
 */
public record QueryRequest(
        String cellId,
        String namespace,
        String sql
) {
}
