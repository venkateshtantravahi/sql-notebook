package io.sqlnotebook.config;

/**
 * Immutable representation of a single database connection configuration.
 *
 * @param namespace The unique name identifying this connection (e.g. "prod_mysql").
 * @param type      The database engine — mysql, postgresql, sqlite, oracle, microsoft-sql-server.
 * @param host      Hostname or IP of the database server. Empty string for SQLite.
 * @param port      Port number. 0 for SQLite.
 * @param database  Database/schema name. File path for SQLite.
 * @param username  Authentication username. Empty string for SQLite.
 * @param password  Authentication password. Empty string for SQLite.
 * @param poolSize  Maximum HikariCP pool size.
 */
public record ConnectionConfig(
        String namespace,
        String type,
        String host,
        int    port,
        String database,
        String username,
        String password,
        int    poolSize
) {}