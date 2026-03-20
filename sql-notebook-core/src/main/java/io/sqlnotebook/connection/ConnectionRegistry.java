package io.sqlnotebook.connection;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.sqlnotebook.config.ConnectionConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages a collection of HikariCP connection pools indexed by their namespace.
 *
 * Pool sizing strategy:
 *   DuckDB is file-based and serialises writes internally, so a pool of 1
 *   is correct  -  extra connections would only queue, never execute in parallel.
 *   For network databases (Postgres, MySQL, etc.) the pool size is capped at
 *   half the available CPU cores (min 2) so the JVM doesn't spawn more
 *   threads than the hardware can service concurrently.
 *
 * DuckDB thread + memory budgeting:
 *   Each DuckDB instance spawns N worker threads (default = all cores).
 *   On constrained machines this causes contention across multiple namespaces.
 *   We set `threads` to half the available CPUs (min 1) and cap memory to
 *   a proportional fraction of the JVM heap at startup.
 *
 * HikariCP knobs applied to every pool:
 *   connectionTimeout  5 s   -  fail fast; 30 s default hangs the UI
 *   keepaliveTime     60 s   -  pings idle connections so firewalls don't drop them
 *   idleTimeout        5 m   -  release unused connections back to the OS
 *   maxLifetime       30 m   -  recycle long-lived connections to avoid stale state
 *   minimumIdle        1     -  always keep one connection warm
 *
 * Thread safety:
 *   pools and ephemeralNamespaces use ConcurrentHashMap so hot-add/remove
 *   from FileSourceHandler and ConnectionHandler is safe under concurrent reads.
 */
public class ConnectionRegistry {

    private static final Logger log = LoggerFactory.getLogger(ConnectionRegistry.class);

    // Derived once at class-load time  -  stable for the lifetime of the JVM
    private static final int  CPUS            = Runtime.getRuntime().availableProcessors();
    private static final int  DUCKDB_THREADS  = Math.max(1, CPUS / 2);
    private static final long JVM_MAX_MB      = Runtime.getRuntime().maxMemory() / (1024L * 1024L);
    private static final long DUCKDB_MEM_MB   = Math.max(256L, JVM_MAX_MB / 4L);

    private final Map<String, HikariDataSource> pools          = new ConcurrentHashMap<>();
    private final Map<String, ConnectionConfig> configMap      = new ConcurrentHashMap<>();
    private final Set<String> ephemeralNamespaces              = ConcurrentHashMap.newKeySet();
    private final Set<String> unhealthyNamespaces              = ConcurrentHashMap.newKeySet();

    public ConnectionRegistry(Map<String, ConnectionConfig> configs) {
        for (ConnectionConfig config : configs.values()) {
            pools.put(config.namespace(), buildPool(config));
            configMap.put(config.namespace(), config);
        }
    }

    /**
     * Eagerly validates every pool by borrowing and returning one connection.
     * Namespaces that fail are marked unhealthy and logged  -  the app continues.
     * Call this after all initial pools are built, before accepting HTTP traffic.
     *
     * @return map of namespace -> error message; empty string = healthy
     */
    public Map<String, String> warmUp() {
        Map<String, String> results = new LinkedHashMap<>();
        for (Map.Entry<String, HikariDataSource> entry : pools.entrySet()) {
            String ns   = entry.getKey();
            String err  = tryConnect(ns, entry.getValue());
            results.put(ns, err);
            if (err.isEmpty()) {
                unhealthyNamespaces.remove(ns);
                log.info("[warmup] pool '{}' OK", ns);
            } else {
                unhealthyNamespaces.add(ns);
                log.warn("[warmup] pool '{}' FAILED: {}", ns, err);
            }
        }
        return results;
    }

    private String tryConnect(String ns, HikariDataSource pool) {
        try (Connection conn = pool.getConnection()) {
            conn.isValid(2);
            return "";
        } catch (Exception e) {
            return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
        }
    }

    // Registration

    public void register(ConnectionConfig config) {
        if (pools.containsKey(config.namespace())) {
            throw new ConnectionRegistryException("Namespace already registered: " + config.namespace());
        }
        pools.put(config.namespace(), buildPool(config));
        configMap.put(config.namespace(), config);
    }

    public void registerEphemeral(ConnectionConfig config) {
        register(config);
        ephemeralNamespaces.add(config.namespace());
    }

    public void registerEphemeralWithProperties(ConnectionConfig config, Properties jdbcProps) {
        if (pools.containsKey(config.namespace())) {
            throw new ConnectionRegistryException("Namespace already registered: " + config.namespace());
        }
        pools.put(config.namespace(), buildPoolWithProperties(config, jdbcProps));
        configMap.put(config.namespace(), config);
        ephemeralNamespaces.add(config.namespace());
    }

    public void deregister(String namespace) {
        HikariDataSource pool = pools.remove(namespace);
        if (pool == null) {
            throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        }
        configMap.remove(namespace);
        ephemeralNamespaces.remove(namespace);
        unhealthyNamespaces.remove(namespace);
        pool.close();
    }

    // Access

    public Connection getConnection(String namespace) {
        HikariDataSource pool = pools.get(namespace);
        if (pool == null) throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        try {
            return pool.getConnection();
        } catch (SQLException e) {
            throw new ConnectionRegistryException("Failed to get connection for namespace: " + namespace, e);
        }
    }

    public DataSource getDataSource(String namespace) {
        HikariDataSource pool = pools.get(namespace);
        if (pool == null) throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        return pool;
    }

    public ConnectionConfig getConfig(String namespace) {
        ConnectionConfig config = configMap.get(namespace);
        if (config == null) throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        return config;
    }

    public Set<String> getNamespaces() {
        return Collections.unmodifiableSet(pools.keySet());
    }

    public boolean hasNamespace(String namespace)  { return pools.containsKey(namespace); }
    public boolean isEphemeral(String namespace)   { return ephemeralNamespaces.contains(namespace); }
    public boolean isHealthy(String namespace)     { return !unhealthyNamespaces.contains(namespace); }

    public void validateNamespace(String namespace) {
        if (!pools.containsKey(namespace)) {
            throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        }
    }

    public void shutdown() {
        pools.values().forEach(HikariDataSource::close);
        pools.clear();
        configMap.clear();
        ephemeralNamespaces.clear();
        unhealthyNamespaces.clear();
    }

    // Pool builders

    private HikariDataSource buildPool(ConnectionConfig config) {
        return new HikariDataSource(buildHikariConfig(config));
    }

    private HikariDataSource buildPoolWithProperties(ConnectionConfig config, Properties jdbcProps) {
        HikariConfig hikari = buildHikariConfig(config);
        jdbcProps.forEach((k, v) -> hikari.addDataSourceProperty(k.toString(), v.toString()));
        return new HikariDataSource(hikari);
    }

    private HikariConfig buildHikariConfig(ConnectionConfig config) {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl(JdbcUrlBuilder.buildUrl(config));
        hikari.setPoolName("pool-" + config.namespace());

        // --- Pool size -------------------------------------------------------
        // DuckDB: pool of 1  -  file-based, internal scheduler handles parallelism
        // Others: min(user-configured, half of CPUs), never below 2
        if (config.type().equals("duckdb")) {
            hikari.setMaximumPoolSize(1);
        } else {
            int adaptiveMax = Math.max(2, CPUS / 2);
            hikari.setMaximumPoolSize(Math.min(config.poolSize(), adaptiveMax));
        }
        hikari.setMinimumIdle(1);

        // --- Timeouts --------------------------------------------------------
        hikari.setConnectionTimeout(5_000);   // fail fast (default 30 s)
        hikari.setIdleTimeout(300_000);        // 5 min idle eviction
        hikari.setKeepaliveTime(60_000);       // 1 min ping to survive firewalls
        hikari.setMaxLifetime(1_800_000);      // 30 min connection recycle

        // --- Auth (not needed for file-based engines) ------------------------
        boolean needsAuth = !config.type().equals("sqlite") && !config.type().equals("duckdb");
        if (needsAuth) {
            hikari.setUsername(config.username());
            hikari.setPassword(config.password());
        }

        // --- DuckDB-specific resource budgeting ------------------------------
        // DuckDB JDBC passes addDataSourceProperty entries to the native config,
        // so these are equivalent to `SET threads = N` and `SET memory_limit`.
        if (config.type().equals("duckdb")) {
            hikari.addDataSourceProperty("threads",      DUCKDB_THREADS);
            hikari.addDataSourceProperty("memory_limit", DUCKDB_MEM_MB + "MB");
        }

        return hikari;
    }
}
