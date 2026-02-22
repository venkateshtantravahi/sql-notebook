package io.sqlnotebook.connection;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.sqlnotebook.config.ConnectionConfig;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * Manages a collection of HikariCP connection pools indexed by their namespace.
 * This registry is responsible for initializing pools, providing active connections,
 * and ensuring proper resource cleanup during shutdown.
 */
public class ConnectionRegistry {
    /**
     * Internal storage for active data sources, keyed by their unique namespace.
     */
    private final Map<String, HikariDataSource> pools = new HashMap<>();

    /**
     * Initializes the registry by creating a connection pool for every provided configuration.
     *
     * @param configs A map of namespace-to-configuration objects.
     */
    public ConnectionRegistry(Map<String, ConnectionConfig> configs) {
        for (ConnectionConfig config : configs.values()) {
            pools.put(config.namespace(), buildPool(config));
        }
    }

    /**
     * Retrieves an active JDBC connection from the specified pool.
     *
     * @param namespace The identifier for the desired database connection.
     * @return A live {@link Connection} object.
     * @throws ConnectionRegistryException if the namespace is unknown or the pool fails to provide a connection.
     */
    public Connection getConnection(String namespace) {
        HikariDataSource pool = pools.get(namespace);
        if (pool == null) {
            throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        }
        try {
            return pool.getConnection();
        } catch (SQLException e) {
            throw new ConnectionRegistryException("Failed to get connection for namespace: " + namespace, e);
        }
    }

    /**
     * @return A set of all registered namespaces currently managed by this registry.
     */
    public Set<String> getNamespaces() {
        return pools.keySet();
    }

    /**
     * Gracefully closes all managed connection pools and clears the registry.
     * This should be called during application shutdown to prevent resource leaks.
     */
    public void shutdown() {
        pools.values().forEach(HikariDataSource::close);
        pools.clear();
    }

    /**
     * Validates that a specific namespace exists within the registry.
     *
     * @throws ConnectionRegistryException if the namespace is not found.
     */
    public void validateNamespace(String namespace) {
        if (!pools.containsKey(namespace)) {
            throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        }
    }

    /**
     * Maps our generic ConnectionConfig fields to HikariCP-specific settings.
     */
    private HikariConfig buildHikariConfig(ConnectionConfig config) {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl(buildJdbcUrl(config));
        hikari.setUsername(config.user());
        hikari.setPassword(config.password());
        hikari.setMaximumPoolSize(config.poolSize());
        hikari.setPoolName("pool-" + config.namespace());
        return hikari;
    }

    /**
     * Instantiates a new HikariDataSource based on the provided configuration.
     */
    private HikariDataSource buildPool(ConnectionConfig config) {
        return new HikariDataSource(buildHikariConfig(config));
    }

    /**
     * Generates the database-specific JDBC connection string.
     * Uses a switch expression to handle various syntax requirements for different engines.
     */
    private String buildJdbcUrl(ConnectionConfig config) {
        return switch (config.type()) {
            case "mysql" -> "jdbc:mysql://%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "postgres" -> "jdbc:postgresql://%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "oracle" -> "jdbc:oracle:thin:@//%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "sqlite" -> "jdbc:sqlite:%s".formatted(config.database());
            case "microsoft-sql-server" ->
                    "jdbc:sqlserver://%s:%d;databaseName=%s;trustServerCertificate=true".formatted(config.host(), config.port(), config.database());
            default -> throw new ConnectionRegistryException("Unsupported type: " + config.type());
        };
    }
}
