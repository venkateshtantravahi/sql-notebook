package io.sqlnotebook.server;

import io.sqlnotebook.config.ConfigParser;
import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.connection.ConnectionRegistryException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Handles the connection management lifecycle.
 * Mounted at /connections/* in HttpServer.
 *
 * POST   /connections/add    — write sql.properties + hot-load into registry
 * POST   /connections/test   — test JDBC connection without writing to disk
 * DELETE /connections/:ns    — remove from sql.properties + deregister from registry
 *
 * Every path has an explicit segment after /connections/ so Jetty's wildcard
 * mapping matches all of them without ambiguity.
 */
public class ConnectionHandler extends HttpServlet {

    private static final Set<String> SUPPORTED_TYPES = Set.of(
            "mysql", "postgresql", "sqlite", "oracle", "microsoft-sql-server"
    );

    private static final String PROPERTIES_FILE = "sql.properties";

    private final ConnectionRegistry registry;
    private final ConfigParser        configParser;
    private final ObjectMapper        mapper;

    public ConnectionHandler(ConnectionRegistry registry) {
        this.registry     = registry;
        this.configParser = new ConfigParser();
        this.mapper       = new ObjectMapper();
    }

    // POST /connections/add  OR  POST /connections/test

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo(); // "/add" or "/test"

        if (!"/add".equals(path) && !"/test".equals(path)) {
            sendError(resp, 404, "Unknown endpoint. Use POST /connections/add or POST /connections/test");
            return;
        }

        ConnectionConfig config;
        try {
            config = parseBody(req);
        } catch (IllegalArgumentException e) {
            sendError(resp, 400, e.getMessage());
            return;
        }

        if ("/test".equals(path)) {
            handleTest(config, resp);
        } else {
            handleConnect(config, resp);
        }
    }

    // DELETE /connections/:namespace

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String pathInfo  = req.getPathInfo(); // "/prod_mysql"
        String namespace = (pathInfo != null) ? pathInfo.replaceFirst("^/", "").trim() : "";

        if (namespace.isEmpty()) {
            sendError(resp, 400, "Namespace is required");
            return;
        }

        // Guard against accidentally routing /add or /test to delete
        if ("add".equals(namespace) || "test".equals(namespace)) {
            sendError(resp, 400, "'" + namespace + "' is a reserved path");
            return;
        }

        if (!registry.hasNamespace(namespace)) {
            sendError(resp, 404, "Unknown namespace: " + namespace);
            return;
        }

        try {
            configParser.remove(PROPERTIES_FILE, namespace);
            registry.deregister(namespace);

            ObjectNode body = mapper.createObjectNode();
            body.put("namespace", namespace);
            body.put("message",   "Connection removed");
            sendJson(resp, 200, body);

        } catch (Exception e) {
            sendError(resp, 500, "Failed to remove connection: " + e.getMessage());
        }
    }

    // private helpers

    private void handleTest(ConnectionConfig config, HttpServletResponse resp) throws IOException {
        try {
            loadDriver(config.type());
        } catch (ClassNotFoundException e) {
            ObjectNode body = mapper.createObjectNode();
            body.put("success", false);
            body.put("message", "JDBC driver not found for type: " + config.type());
            sendJson(resp, 400, body);
            return;
        }

        String jdbcUrl = buildJdbcUrl(config);

        try (Connection conn = DriverManager.getConnection(
                jdbcUrl, config.username(), config.password())) {
            conn.isValid(5);
            ObjectNode body = mapper.createObjectNode();
            body.put("success", true);
            body.put("message", "Connection successful");
            sendJson(resp, 200, body);
        } catch (Exception e) {
            ObjectNode body = mapper.createObjectNode();
            body.put("success", false);
            body.put("message", friendlyError(e.getMessage()));
            sendJson(resp, 400, body);
        }
    }

    private void handleConnect(ConnectionConfig config, HttpServletResponse resp) throws IOException {
        if (registry.hasNamespace(config.namespace())) {
            sendError(resp, 409, "Namespace '" + config.namespace() + "' already exists");
            return;
        }

        try {
            ConfigParser.write(PROPERTIES_FILE, config);
            registry.register(config);

            ObjectNode body = mapper.createObjectNode();
            body.put("namespace", config.namespace());
            body.put("message",   "Connection added");
            sendJson(resp, 201, body);

        } catch (ConnectionRegistryException e) {
            try { configParser.remove(PROPERTIES_FILE, config.namespace()); } catch (Exception ignored) {}
            sendError(resp, 500, "Failed to register connection: " + e.getMessage());
        } catch (Exception e) {
            sendError(resp, 500, "Failed to save connection: " + e.getMessage());
        }
    }

    private ConnectionConfig parseBody(HttpServletRequest req) throws IOException {
        String body = req.getReader().lines().collect(Collectors.joining());
        JsonNode node = mapper.readTree(body);

        String namespace = textOrNull(node, "namespace");
        String type      = textOrNull(node, "type");
        String host      = textOrNull(node, "host");
        String portStr   = textOrNull(node, "port");
        String database  = textOrNull(node, "database");
        String username  = textOrNull(node, "username");
        String password  = node.has("password") ? node.get("password").asString() : "";

        if (namespace == null || namespace.isBlank())
            throw new IllegalArgumentException("namespace is required");
        if (!namespace.matches("[a-z0-9_]+"))
            throw new IllegalArgumentException("namespace must be lowercase letters, numbers and underscores only");
        if (type == null || type.isBlank())
            throw new IllegalArgumentException("type is required");
        if (!SUPPORTED_TYPES.contains(type))
            throw new IllegalArgumentException("Unsupported type: " + type + ". Supported: " + SUPPORTED_TYPES);
        if (database == null || database.isBlank())
            throw new IllegalArgumentException("database is required");

        boolean isSqlite = "sqlite".equals(type);
        int port = 0;

        if (!isSqlite) {
            if (host == null || host.isBlank())
                throw new IllegalArgumentException("host is required");
            if (portStr == null || portStr.isBlank())
                throw new IllegalArgumentException("port is required");
            try {
                port = Integer.parseInt(portStr);
                if (port < 1 || port > 65535)
                    throw new IllegalArgumentException("port must be between 1 and 65535");
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("port must be a number");
            }
            if (username == null || username.isBlank())
                throw new IllegalArgumentException("username is required");
        }

        return new ConnectionConfig(
                namespace, type,
                isSqlite ? "" : host,
                port,
                database,
                isSqlite ? "" : username,
                password,
                5
        );
    }

    private void loadDriver(String type) throws ClassNotFoundException {
        String driverClass = switch (type) {
            case "mysql"                -> "com.mysql.cj.jdbc.Driver";
            case "postgresql"           -> "org.postgresql.Driver";
            case "oracle"               -> "oracle.jdbc.OracleDriver";
            case "microsoft-sql-server" -> "com.microsoft.sqlserver.jdbc.SQLServerDriver";
            case "sqlite"               -> "org.sqlite.JDBC";
            default -> throw new ClassNotFoundException("No driver for type: " + type);
        };
        Class.forName(driverClass);
    }

    private String buildJdbcUrl(ConnectionConfig c) {
        return switch (c.type()) {
            case "mysql"                -> "jdbc:mysql://%s:%d/%s".formatted(c.host(), c.port(), c.database());
            case "postgresql"           -> "jdbc:postgresql://%s:%d/%s".formatted(c.host(), c.port(), c.database());
            case "oracle"               -> "jdbc:oracle:thin:@//%s:%d/%s".formatted(c.host(), c.port(), c.database());
            case "microsoft-sql-server" -> "jdbc:sqlserver://%s:%d;databaseName=%s;trustServerCertificate=true"
                    .formatted(c.host(), c.port(), c.database());
            case "sqlite"               -> "jdbc:sqlite:%s".formatted(c.database());
            default -> throw new IllegalArgumentException("Unsupported type: " + c.type());
        };
    }

    private String friendlyError(String raw) {
        if (raw == null) return "Connection failed";
        if (raw.contains("Connection refused") || raw.contains("connect to host"))
            return "Connection refused — check host and port";
        if (raw.contains("Access denied") || raw.contains("password"))
            return "Authentication failed — check username and password";
        if (raw.contains("Unknown database") || raw.contains("does not exist"))
            return "Database not found — check database name";
        if (raw.contains("SSL") || raw.contains("ssl"))
            return "SSL required — check your database SSL settings";
        if (raw.contains("timeout") || raw.contains("timed out"))
            return "Connection timed out — check host and firewall rules";
        int dot = raw.indexOf('.');
        return dot > 0 ? raw.substring(0, dot) : raw;
    }

    private String textOrNull(JsonNode node, String field) {
        return node.has(field) ? node.get(field).asString() : null;
    }

    private void sendJson(HttpServletResponse resp, int status, Object body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.getWriter().write(mapper.writeValueAsString(body));
    }

    private void sendError(HttpServletResponse resp, int status, String message) throws IOException {
        ObjectNode body = mapper.createObjectNode();
        body.put("error", message);
        sendJson(resp, status, body);
    }
}
