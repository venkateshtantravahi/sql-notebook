package io.sqlnotebook.config;

/**
 * An immutable representation of a database connection configuration.
 * * @param namespace The unique identifier used to group these settings (e.g., "mysql", "postgres").
 *
 * @param type     The database engine type (must be one of the supported types in ConfigParser).
 * @param host     The network address of the database server.
 * @param port     The port number the database is listening on.
 * @param database The specific database or schema name to connect to.
 * @param user     The username for authentication.
 * @param password The password for authentication.
 * @param poolSize The maximum number of connections allowed in the connection pool.
 */
public record ConnectionConfig(
        String namespace,
        String type,
        String host,
        int port,
        String database,
        String user,
        String password,
        int poolSize
) {
}