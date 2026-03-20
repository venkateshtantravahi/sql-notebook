package io.sqlnotebook.config;

import java.io.*;
import java.nio.file.*;
import java.util.*;

/**
 * Parses and writes database connection configurations from/to a sql.properties file.
 *
 * Expected format  -  one block per namespace:
 * <pre>
 *   prod_mysql.type=mysql
 *   prod_mysql.host=localhost
 *   prod_mysql.port=3306
 *   prod_mysql.database=mydb
 *   prod_mysql.username=root
 *   prod_mysql.password=secret
 * </pre>
 *
 * SQLite omits host/port/username/password  -  only type and database are required.
 */
public class ConfigParser {

    public static final String DEFAULT_CONFIG_FILE = "sql.properties";

    private static final Set<String> SUPPORTED_TYPES = Set.of(
            "mysql", "postgresql", "sqlite", "oracle", "microsoft-sql-server"
    );

    // Smart pool size  -  small fixed default, no user input required
    private static final int DEFAULT_POOL_SIZE = 5;

    /**
     * Parses sql.properties and returns a map of namespace -> ConnectionConfig.
     * Returns an empty map (not an exception) if the file does not exist  - 
     * the app starts fine with no connections.
     */
    public Map<String, ConnectionConfig> parse(String configFile) {
        Path path = Path.of(configFile);
        if (!Files.exists(path)) {
            return new HashMap<>();
        }
        Properties props = loadFile(configFile);
        Map<String, Map<String, String>> grouped = groupByNamespace(props);

        Map<String, ConnectionConfig> result = new LinkedHashMap<>();
        for (Map.Entry<String, Map<String, String>> entry : grouped.entrySet()) {
            result.put(entry.getKey(), buildConfig(entry.getKey(), entry.getValue()));
        }
        return result;
    }

    /**
     * Loads raw properties from the filesystem.
     *
     * @throws ConfigException if the file exists but cannot be read.
     */
    public static Properties loadFile(String configFile) {
        Properties props = new Properties();
        try (FileInputStream fis = new FileInputStream(configFile)) {
            props.load(fis);
        } catch (IOException e) {
            throw new ConfigException("Cannot read config file: " + configFile + "  -  " + e.getMessage());
        }
        return props;
    }

    /**
     * Groups flat properties into a nested map by namespace prefix.
     * Keys are expected in the format: namespace.field
     */
    private Map<String, Map<String, String>> groupByNamespace(Properties props) {
        Map<String, Map<String, String>> grouped = new LinkedHashMap<>();
        for (String key : props.stringPropertyNames()) {
            int dot = key.indexOf('.');
            if (dot < 1) continue; // skip keys with no dot or leading dot

            String namespace = key.substring(0, dot);
            String field     = key.substring(dot + 1).strip();
            grouped.computeIfAbsent(namespace, k -> new LinkedHashMap<>())
                    .put(field, props.getProperty(key).strip());
        }
        return grouped;
    }

    /**
     * Validates fields and constructs a ConnectionConfig.
     *
     * @throws ConfigException if required fields are missing or invalid.
     */
    private ConnectionConfig buildConfig(String namespace, Map<String, String> fields) {
        String type = require(namespace, fields, "type");
        if (!SUPPORTED_TYPES.contains(type)) {
            throw new ConfigException(
                    "Unsupported type '" + type + "' for namespace '" + namespace +
                            "'. Supported: " + SUPPORTED_TYPES
            );
        }

        String database = require(namespace, fields, "database");
        boolean isSqlite = type.equals("sqlite");

        // SQLite only needs type + database
        if (isSqlite) {
            return new ConnectionConfig(
                    namespace, type,
                    "",  // host
                    0,   // port
                    database,
                    "",  // username
                    "",  // password
                    DEFAULT_POOL_SIZE
            );
        }

        String host     = require(namespace, fields, "host");
        String portStr  = require(namespace, fields, "port");
        String username = require(namespace, fields, "username");
        String password = fields.getOrDefault("password", "");

        int port;
        try {
            port = Integer.parseInt(portStr);
            if (port < 1 || port > 65535) throw new NumberFormatException();
        } catch (NumberFormatException e) {
            throw new ConfigException("Invalid port '" + portStr + "' for namespace: " + namespace);
        }

        return new ConnectionConfig(
                namespace, type, host, port, database, username, password, DEFAULT_POOL_SIZE
        );
    }

    /**
     * Appends a new namespace block to sql.properties.
     * Creates the file with a header comment if it does not exist yet.
     * Throws ConfigException if the namespace already exists in the file.
     */
    public static void write(String configFile, ConnectionConfig config) {
        Path path = Path.of(configFile);

        // Check for duplicate namespace
        if (Files.exists(path)) {
            Properties existing = loadFile(configFile);
            if (existing.containsKey(config.namespace() + ".type")) {
                throw new ConfigException(
                        "Namespace '" + config.namespace() + "' already exists in " + configFile
                );
            }
        }

        try (BufferedWriter writer = Files.newBufferedWriter(
                path,
                StandardOpenOption.CREATE,
                StandardOpenOption.APPEND)) {

            // Write file header on first creation
            if (!Files.exists(path) || Files.size(path) == 0) {
                writer.write("# sql-notebook connections");
                writer.newLine();
                writer.write("# Do not edit manually while the application is running");
                writer.newLine();
            }

            writer.newLine();
            writer.write("# " + config.namespace());
            writer.newLine();
            writer.write(config.namespace() + ".type=" + config.type());
            writer.newLine();

            if (!config.type().equals("sqlite")) {
                writer.write(config.namespace() + ".host=" + config.host());
                writer.newLine();
                writer.write(config.namespace() + ".port=" + config.port());
                writer.newLine();
                writer.write(config.namespace() + ".username=" + config.username());
                writer.newLine();
                writer.write(config.namespace() + ".password=" + config.password());
                writer.newLine();
            }

            writer.write(config.namespace() + ".database=" + config.database());
            writer.newLine();

        } catch (IOException e) {
            throw new ConfigException("Failed to write config: " + e.getMessage());
        }
    }

    /**
     * Removes a namespace block from sql.properties by rewriting the file
     * without the lines belonging to that namespace.
     */
    public void remove(String configFile, String namespace) {
        Path path = Path.of(configFile);
        if (!Files.exists(path)) return;

        try {
            List<String> lines    = Files.readAllLines(path);
            List<String> filtered = new ArrayList<>();
            boolean skipNext = false;

            for (String line : lines) {
                String trimmed = line.strip();

                // Skip the comment header line for this namespace
                if (trimmed.equals("# " + namespace)) {
                    skipNext = true;
                    continue;
                }

                // Skip all property lines belonging to this namespace
                if (trimmed.startsWith(namespace + ".")) {
                    skipNext = false;
                    continue;
                }

                // Skip the blank line before the namespace block
                if (skipNext && trimmed.isEmpty()) {
                    skipNext = false;
                    continue;
                }

                skipNext = false;
                filtered.add(line);
            }

            Files.write(path, filtered, StandardOpenOption.TRUNCATE_EXISTING);

        } catch (IOException e) {
            throw new ConfigException("Failed to remove namespace '" + namespace + "': " + e.getMessage());
        }
    }

    private String require(String namespace, Map<String, String> fields, String key) {
        String value = fields.get(key);
        if (value == null || value.isBlank()) {
            throw new ConfigException(
                    "Missing required field '" + key + "' for namespace: " + namespace
            );
        }
        return value.strip();
    }
}