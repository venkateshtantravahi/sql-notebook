package io.sqlnotebook.connection;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.sqlnotebook.config.ConnectionConfig;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

public class ConnectionRegistry {

    private final Map<String, HikariDataSource> pools = new HashMap<>();

    public ConnectionRegistry(Map<String, ConnectionConfig> configs) {
        for (ConnectionConfig config: configs.values()) {
            pools.put(config.namespace(), buildPool(config));
        }
    }

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

    public Set<String> getNamespaces() {
        return pools.keySet();
    }

    public void shutdown() {
        pools.values().forEach(HikariDataSource::close);
        pools.clear();
    }

    public void validateNamespace(String namespace) {
        if (!pools.containsKey(namespace)) {
            throw new ConnectionRegistryException("Unknown namespace: " + namespace);
        }
    }

    private HikariConfig buildHikariConfig(ConnectionConfig config) {
        HikariConfig hikari =  new HikariConfig();
        hikari.setJdbcUrl(buildJdbcUrl(config));
        hikari.setUsername(config.user());
        hikari.setPassword(config.password());
        hikari.setMaximumPoolSize(config.poolSize());
        hikari.setPoolName("pool-" + config.namespace());
        return hikari;
    }

    private HikariDataSource buildPool(ConnectionConfig config) {
        return new HikariDataSource(buildHikariConfig(config));
    }

    private String buildJdbcUrl(ConnectionConfig config) {
        return switch (config.type()) {
            case "mysql"                 -> "jdbc:mysql://%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "postgres"              -> "jdbc:postgresql://%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "oracle"                -> "jdbc:oracle:thin:@//%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "sqlite"                -> "jdbc:sqlite:%s".formatted(config.database());
            case "microsoft-sql-server"  -> "jdbc:sqlserver://%s:%d;databaseName=%s;trustServerCertificate=true".formatted(config.host(), config.port(), config.database());
            default -> throw new ConnectionRegistryException("Unsupported type: " + config.type());
        };
    }
}
