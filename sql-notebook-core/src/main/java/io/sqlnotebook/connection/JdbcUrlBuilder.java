package io.sqlnotebook.connection;

import io.sqlnotebook.config.ConnectionConfig;

/**
 * Builds JDBC connection URLs and loads driver classes for all supported database types.
 *
 * <p>Centralises URL construction logic that was previously duplicated between
 * {@link ConnectionRegistry} and {@code ConnectionHandler}.
 *
 * <p>Supported types: mysql, postgresql, oracle, sqlite, duckdb, microsoft-sql-server.
 */
public final class JdbcUrlBuilder {

    private JdbcUrlBuilder() {}

    /**
     * Builds a JDBC URL from the given connection configuration.
     *
     * @param config the connection configuration
     * @return a valid JDBC URL string
     * @throws IllegalArgumentException if the database type is not supported
     */
    public static String buildUrl(ConnectionConfig config) {
        return switch (config.type()) {
            case "mysql" ->
                    "jdbc:mysql://%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "postgresql" ->
                    "jdbc:postgresql://%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "oracle" ->
                    "jdbc:oracle:thin:@//%s:%d/%s".formatted(config.host(), config.port(), config.database());
            case "microsoft-sql-server" ->
                    "jdbc:sqlserver://%s:%d;databaseName=%s;trustServerCertificate=true"
                            .formatted(config.host(), config.port(), config.database());
            case "sqlite" ->
                    "jdbc:sqlite:%s".formatted(config.database());
            case "duckdb" ->
                    "jdbc:duckdb:%s".formatted(config.database());
            default ->
                    throw new IllegalArgumentException("Unsupported database type: " + config.type());
        };
    }

    /**
     * Loads the JDBC driver class for the given database type.
     * Required before opening a {@link java.sql.DriverManager} connection directly
     * (HikariCP loads drivers automatically, so this is only needed for test connections).
     *
     * @param type database type string (e.g. "mysql", "postgresql")
     * @throws ClassNotFoundException if no driver is available for the given type
     */
    public static void loadDriver(String type) throws ClassNotFoundException {
        String driverClass = switch (type) {
            case "mysql"                -> "com.mysql.cj.jdbc.Driver";
            case "postgresql"           -> "org.postgresql.Driver";
            case "oracle"               -> "oracle.jdbc.OracleDriver";
            case "microsoft-sql-server" -> "com.microsoft.sqlserver.jdbc.SQLServerDriver";
            case "sqlite"               -> "org.sqlite.JDBC";
            default -> throw new ClassNotFoundException("No JDBC driver registered for type: " + type);
        };
        Class.forName(driverClass);
    }
}
