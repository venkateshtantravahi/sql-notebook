package io.sqlnotebook.server;

public record QueryRequest(
        String cellId,
        String namespace,
        String sql
) {
}
