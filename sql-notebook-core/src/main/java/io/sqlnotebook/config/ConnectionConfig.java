package io.sqlnotebook.config;

public record ConnectionConfig(
    String namespace,
    String type,
    String host,
    int port,
    String database,
    String user,
    String password,
    int poolSize
) { }