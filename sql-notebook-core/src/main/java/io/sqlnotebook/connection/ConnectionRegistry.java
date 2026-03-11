package io.sqlnotebook.connection;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.JdbcUrlBuilder;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages a collection of HikariCP connection pools indexed by their namespace.
 * This registry is responsible for initializing pools, providing active connections,
 * and ensuring proper resource cleanup during shutdown.
 *
 * Thread safety:
 *   pools and ephemeralNamespaces use ConcurrentHashMap so hot-add/remove
 *   from FileSourceHandler and ConnectionHandler is safe under concurrent reads
 *   from QueryExecutor (which holds connections for the duration of a query).
 *
 * Ephemeral namespaces:
 *   File and remote data sources registered via DuckDbRegistrar are marked
 *   ephemeral. This flag has one purpose: ConnectionHandler's DELETE endpoint
 *   only writes back to sql.properties for non-ephemeral connections. Ephemeral
 *   sources are managed entirely by FileSourceRegistry / sources.json.
 */
public class ConnectionRegistry {

    private final Map<String, HikariDataSource> pools = new ConcurrentHashMap<>();
    private final Set<String> ephemeralNamespaces = ConcurrentHashMap.newKeySet();
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
     * Hot-register a new namespace without restarting the application.
     * Used by ConnectionHandler (persistent connections) and
     * DuckDbRegistrar (ephemeral file/remote sources).
     *
     * @param config    the connection configuration to register
     * @throws ConnectionRegistryException if the namespace is already registered
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
     * Hot-register a new namespace, marking it as ephemeral.
     * Ephemeral namespaces are managed by FileSourceRegistry and are not
     * written to sql.properties when removed.
     *
     * @param config    the connection configuration to register
     */
    public void registerEphemeral(ConnectionConfig config) {
        register(config);
        ephemeralNamespaces.add(config.namespace());
    }

    /**
     * Remove a namespace from the registry and close its connection pool.
     * Safe to call concurrently — pool is closed after removal from the map.
     *
     * @param namespace the namespace to remove
     * @throws ConnectionRegistryException if the namespace is not found
     */
    public void deregister(String namespace) {
        HikariDataSource pool = pools.remove(namespace);
        if (pool == null) {
            throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        }
        ephemeralNamespaces.remove(namespace);
        pool.close();
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
            throw new ConnectionRegistryException(
                    "Failed to get connection for namespace: " + namespace, e
            );
        }
    }

    /**
     * @return An unmodifiable view of all registered namespaces.
     */
    public Set<String> getNamespaces() {
        return Collections.unmodifiableSet(pools.keySet());
    }

    /**
     * @return true if the namespace exists in this registry
     */
    public boolean hasNamespace(String namespace) {
        return pools.containsKey(namespace);
    }

    /**
     * @return true if the namespace is ephemeral (file / remote source)
     */
    public boolean isEphemeral(String namespace) {
        return ephemeralNamespaces.contains(namespace);
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
        ephemeralNamespaces.clear();
    }

    /* private helpers */

    private HikariDataSource buildPool(ConnectionConfig config) {
        return new HikariDataSource(buildHikariConfig(config));
    }

    private HikariConfig buildHikariConfig(ConnectionConfig config) {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl(JdbcUrlBuilder.buildUrl(config));
        hikari.setPoolName("pool-" + config.namespace());
        hikari.setMaximumPoolSize(config.poolSize());

        // SQLite and DuckDB use file-based access — no username/password required
        boolean needsAuth = !config.type().equals("sqlite") && !config.type().equals("duckdb");
        if (needsAuth) {
            hikari.setUsername(config.username());
            hikari.setPassword(config.password());
        }

        return hikari;
    }
}
