package io.sqlnotebook.config;

import java.io.FileInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.Properties;
import java.util.Set;

/**
 * Utility class to parse database configurations from a .properties file.
 * It expects keys in the format: db.<namespace>.<field>
 */
public class ConfigParser {

    /**
     * Set of database engines currently supported by the application.
     */
    private static final Set<String> SUPPORTED_TYPES = Set.of(
            "mysql", "oracle", "postgres", "sqlite", "microsoft-sql-server"
    );
    /**
     * Default connection pool size if not explicitly provided in the config.
     */
    private static final int DEFAULT_POOL_SIZE = 5;

    /**
     * Reads a property file and converts it into a map of ConnectionConfig objects.
     * * @param configFile Path to the .properties file.
     *
     * @return A Map where the key is the namespace and the value is the configuration.
     */
    public Map<String, ConnectionConfig> parse(String configFile) {
        Properties props = loadFile(configFile);

        Map<String, Map<String, String>> grouped = groupByNamespace(props);

        Map<String, ConnectionConfig> result = new HashMap<>();
        for (Map.Entry<String, Map<String, String>> entry : grouped.entrySet()) {
            result.put(entry.getKey(), buildConfig(entry.getKey(), entry.getValue()));
        }
        return result;
    }

    /**
     * Loads the raw properties from the filesystem.
     * * @throws ConfigException if the file is missing or unreadable.
     */
    public Properties loadFile(String configFile) {
        Properties props = new Properties();
        try (FileInputStream fis = new FileInputStream(configFile)) {
            props.load(fis);
        } catch (IOException e) {
            throw new ConfigException("Config file not found: " + configFile);
        }
        return props;
    }

    /**
     * Organizes flat properties into a nested map structure based on the db.<namespace> prefix.
     */
    private Map<String, Map<String, String>> groupByNamespace(Properties props) {
        Map<String, Map<String, String>> grouped = new HashMap<>();
        for (String key : props.stringPropertyNames()) {
            // expecting: db.<namespace>.<field>
            String[] parts = key.split("\\.", 3);
            if (parts.length != 3 || !parts[0].equals("db")) continue;

            String namespace = parts[1];
            String field = parts[2];
            grouped.computeIfAbsent(namespace, k -> new HashMap<>())
                    .put(field.strip(), props.getProperty(key).strip());
        }
        return grouped;
    }

    /**
     * Validates and constructs a ConnectionConfig object from the grouped fields.
     * * @throws ConfigException if required fields are missing or data types are invalid.
     */
    private ConnectionConfig buildConfig(String namespace, Map<String, String> fields) {
        String type = require(namespace, fields, "type");
        if (!SUPPORTED_TYPES.contains(type)) {
            throw new ConfigException("Unsupported type '" + type + "' for namespace: " + namespace);
        }

        String host = require(namespace, fields, "host");
        String portStr = require(namespace, fields, "port");
        String database = require(namespace, fields, "database");
        String user = require(namespace, fields, "user");
        String password = require(namespace, fields, "password");

        int port;
        try {
            port = Integer.parseInt(portStr);
        } catch (NumberFormatException e) {
            throw new ConfigException("Invalid port for namespace: " + namespace);
        }

        int poolSize = DEFAULT_POOL_SIZE;
        if (fields.containsKey("pool.size")) {
            try {
                poolSize = Integer.parseInt(fields.get("pool.size"));
            } catch (NumberFormatException e) {
                throw new ConfigException("Invalid pool size for namespace: " + namespace);
            }
        }

        return new ConnectionConfig(namespace, type, host, port, database, user, password, poolSize);
    }

    private String require(String namespace, Map<String, String> fields, String key) {
        String value = fields.get(key);
        if (value == null || value.isBlank()) {
            throw new ConfigException("Missing required field '" + key + "' for namespace: " + namespace);
        }
        return value.strip();
    }
}
