package io.sqlnotebook.connection;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.sqlnotebook.config.ConnectionConfig;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages HikariCP connection pools indexed by namespace.
 * Thread-safe — supports hot-loading new connections at runtime
 * via register() without requiring an application restart.
 */
public class ConnectionRegistry {

    private final ConcurrentHashMap<String, HikariDataSource> pools = new ConcurrentHashMap<>();

    /**
     * Initialises the registry from a map of configs.
     * Typically called at startup with configs parsed from sql.properties.
     * Accepts an empty map — app starts fine with no connections.
     */
    public ConnectionRegistry(Map<String, ConnectionConfig> configs) {
        for (ConnectionConfig config : configs.values()) {
            pools.put(config.namespace(), buildPool(config));
        }
    }

    /**
     * Hot-loads a new connection pool for the given config at runtime.
     * Called by ConnectionHandler after writing the config to sql.properties.
     *
     * @throws ConnectionRegistryException if namespace already exists.
     */
    public void register(ConnectionConfig config) {
        if (pools.containsKey(config.namespace())) {
            throw new ConnectionRegistryException(
                    "Namespace already registered: " + config.namespace()
            );
        }
        pools.put(config.namespace(), buildPool(config));
    }

    /**
     * Closes and removes the pool for the given namespace.
     * Called by ConnectionHandler after removing from sql.properties.
     *
     * @throws ConnectionRegistryException if namespace is not found.
     */
    public void deregister(String namespace) {
        HikariDataSource pool = pools.remove(namespace);
        if (pool == null) {
            throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        }
        pool.close();
    }

    /**
     * Returns a live JDBC connection from the named pool.
     *
     * @throws ConnectionRegistryException if namespace unknown or pool fails.
     */
    public Connection getConnection(String namespace) {
        HikariDataSource pool = pools.get(namespace);
        if (pool == null) {
            throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        }
        try {
            return pool.getConnection();
        } catch (SQLException e) {
            throw new ConnectionRegistryException(
                    "Failed to get connection for namespace: " + namespace, e
            );
        }
    }

    /**
     * Returns a sorted snapshot of registered namespace names.
     * Returns a copy — safe for concurrent modification.
     */
    public Set<String> getNamespaces() {
        return new TreeSet<>(pools.keySet());
    }

    /**
     * Returns true if the namespace is currently registered.
     */
    public boolean hasNamespace(String namespace) {
        return pools.containsKey(namespace);
    }

    /**
     * Validates that a namespace exists.
     *
     * @throws ConnectionRegistryException if not found.
     */
    public void validateNamespace(String namespace) {
        if (!pools.containsKey(namespace)) {
            throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        }
    }

    /**
     * Closes all pools and clears the registry.
     * Call during application shutdown.
     */
    public void shutdown() {
        pools.values().forEach(HikariDataSource::close);
        pools.clear();
    }

    // ── private helpers ───────────────────────────────────────────────────────

    private HikariDataSource buildPool(ConnectionConfig config) {
        return new HikariDataSource(buildHikariConfig(config));
    }

    private HikariConfig buildHikariConfig(ConnectionConfig config) {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl(buildJdbcUrl(config));
        hikari.setPoolName("pool-" + config.namespace());
        hikari.setMaximumPoolSize(config.poolSize());

        // SQLite uses file-based auth — no username/password
        if (!config.type().equals("sqlite")) {
            hikari.setUsername(config.username());
            hikari.setPassword(config.password());
        }
        return hikari;
    }

    private String buildJdbcUrl(ConnectionConfig config) {
        return switch (config.type()) {
            case "mysql" ->
                    "jdbc:mysql://%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "postgresql" ->
                    "jdbc:postgresql://%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "oracle" ->
                    "jdbc:oracle:thin:@//%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "sqlite" ->
                    "jdbc:sqlite:%s".formatted(config.database());
            case "microsoft-sql-server" ->
                    "jdbc:sqlserver://%s:%d;databaseName=%s;trustServerCertificate=true"
                            .formatted(config.host(), config.port(), config.database());
            default ->
                    throw new ConnectionRegistryException("Unsupported database type: " + config.type());
        };
    }
}
