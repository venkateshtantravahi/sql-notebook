package io.sqlnotebook.server;

import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.duckdb.DuckDbRegistrar;
import io.sqlnotebook.duckdb.FileSourceRegistry;
import io.sqlnotebook.duckdb.PinnedViewRegistry;
import io.sqlnotebook.executor.QueryExecutor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class ConnectionHandlerTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:13");

    @Container
    static MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.0");

    @TempDir
    Path tempDir;

    private HttpServer server;
    private HttpClient http;
    private ObjectMapper mapper;
    private int port;

    @BeforeEach
    void setUp() throws Exception {
        ConnectionRegistry registry = new ConnectionRegistry(Map.of("pg", postgresConfig()));
        DuckDbRegistrar registrar = new DuckDbRegistrar(registry);
        FileSourceRegistry sourceRegistry = new FileSourceRegistry(registrar);
        QueryExecutor executor = new QueryExecutor(registry);
        PinnedViewRegistry pinnedRegistry = new PinnedViewRegistry(registry, tempDir.resolve("pinned").toString());
        server = new HttpServer(0, registry, executor, sourceRegistry, registrar, pinnedRegistry);
        server.start();
        port   = server.getPort();
        http   = HttpClient.newHttpClient();
        mapper = new ObjectMapper();
    }

    @AfterEach
    void tearDown() throws Exception {
        server.stop();
        Path props = Path.of("sql.properties");
        if (Files.exists(props)) Files.delete(props);
    }

    // POST /connections/test

    @Test
    void testConnection_returnsSuccessForValidCredentials() throws Exception {
        String body = buildPayload("pg_test", "postgresql",
                postgres.getHost(), postgres.getMappedPort(5432),
                postgres.getDatabaseName(), postgres.getUsername(), postgres.getPassword());

        HttpResponse<String> res = post("/connections/test", body);

        assertEquals(200, res.statusCode());
        JsonNode json = mapper.readTree(res.body());
        assertTrue(json.get("success").asBoolean());
        assertTrue(json.get("message").asString().contains("successful"));
    }

    @Test
    void testConnection_returns400ForWrongPassword() throws Exception {
        String body = buildPayload("pg_bad", "postgresql",
                postgres.getHost(), postgres.getMappedPort(5432),
                postgres.getDatabaseName(), postgres.getUsername(), "wrong_password_xyz");

        HttpResponse<String> res = post("/connections/test", body);

        assertEquals(400, res.statusCode());
        JsonNode json = mapper.readTree(res.body());
        assertFalse(json.get("success").asBoolean());
        assertNotNull(json.get("message").asString());
    }

    @Test
    void testConnection_returns400ForUnreachableHost() throws Exception {
        String body = buildPayload("pg_unreachable", "postgresql",
                "999.999.999.999", 5432, "mydb", "user", "pass");

        HttpResponse<String> res = post("/connections/test", body);

        assertEquals(400, res.statusCode());
        JsonNode json = mapper.readTree(res.body());
        assertFalse(json.get("success").asBoolean());
    }

    @Test
    void testConnection_returns400WhenNamespaceMissing() throws Exception {
        String body = """
                {"type":"postgresql","host":"localhost","port":5432,"database":"db","username":"u","password":"p"}
                """;

        HttpResponse<String> res = post("/connections/test", body);
        assertEquals(400, res.statusCode());
    }

    @Test
    void testConnection_returnsSuccessForMysql() throws Exception {
        String body = buildPayload("mysql_test", "mysql",
                mysql.getHost(), mysql.getMappedPort(3306),
                mysql.getDatabaseName(), mysql.getUsername(), mysql.getPassword());

        HttpResponse<String> res = post("/connections/test", body);

        assertEquals(200, res.statusCode());
        JsonNode json = mapper.readTree(res.body());
        assertTrue(json.get("success").asBoolean());
    }

    // POST /connections/add

    @Test
    void connect_returns201AndHotLoadsIntoRegistry() throws Exception {
        String body = buildPayload("mysql_new", "mysql",
                mysql.getHost(), mysql.getMappedPort(3306),
                mysql.getDatabaseName(), mysql.getUsername(), mysql.getPassword());

        HttpResponse<String> res = post("/connections/add", body);

        assertEquals(201, res.statusCode());
        JsonNode json = mapper.readTree(res.body());
        assertEquals("mysql_new", json.get("namespace").asString());

        assertTrue(Files.exists(Path.of("sql.properties")));
        String props = Files.readString(Path.of("sql.properties"));
        assertTrue(props.contains("mysql_new.type=mysql"));
    }

    @Test
    void connect_returns409IfNamespaceAlreadyExists() throws Exception {
        String body = buildPayload("pg", "postgresql",
                postgres.getHost(), postgres.getMappedPort(5432),
                postgres.getDatabaseName(), postgres.getUsername(), postgres.getPassword());

        HttpResponse<String> res = post("/connections/add", body);

        assertEquals(409, res.statusCode());
        JsonNode json = mapper.readTree(res.body());
        assertTrue(json.get("error").asString().contains("already exists"));
    }

    @Test
    void connect_returns400ForInvalidNamespace() throws Exception {
        String body = buildPayload("My Bad Namespace!", "postgresql",
                postgres.getHost(), postgres.getMappedPort(5432),
                postgres.getDatabaseName(), postgres.getUsername(), postgres.getPassword());

        HttpResponse<String> res = post("/connections/add", body);
        assertEquals(400, res.statusCode());
    }

    // DELETE /connections/:namespace

    @Test
    void delete_returns200AndRemovesNamespace() throws Exception {
        // Add first
        String body = buildPayload("mysql_del", "mysql",
                mysql.getHost(), mysql.getMappedPort(3306),
                mysql.getDatabaseName(), mysql.getUsername(), mysql.getPassword());
        post("/connections/add", body);

        HttpResponse<String> res = delete("/connections/mysql_del");

        assertEquals(200, res.statusCode());
        JsonNode json = mapper.readTree(res.body());
        assertEquals("mysql_del", json.get("namespace").asString());

        if (Files.exists(Path.of("sql.properties"))) {
            assertFalse(Files.readString(Path.of("sql.properties")).contains("mysql_del"));
        }
    }

    @Test
    void delete_returns404ForUnknownNamespace() throws Exception {
        HttpResponse<String> res = delete("/connections/nonexistent");
        assertEquals(404, res.statusCode());
    }

    @Test
    void delete_returns400WhenNamespaceMissing() throws Exception {
        // DELETE /connections/  → pathInfo "/" → namespace "" → 400
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + "/connections/"))
                .method("DELETE", HttpRequest.BodyPublishers.noBody())
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        assertEquals(400, res.statusCode());
    }

    // helpers

    private String buildPayload(String namespace, String type, String host, int port,
                                String database, String username, String password) {
        return """
                {
                  "namespace": "%s",
                  "type":      "%s",
                  "host":      "%s",
                  "port":      %d,
                  "database":  "%s",
                  "username":  "%s",
                  "password":  "%s"
                }
                """.formatted(namespace, type, host, port, database, username, password);
    }

    private HttpResponse<String> post(String path, String body) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return http.send(req, HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> delete(String path) throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + port + path))
                .DELETE()
                .build();
        return http.send(req, HttpResponse.BodyHandlers.ofString());
    }

    private ConnectionConfig postgresConfig() {
        return new ConnectionConfig(
                "pg", "postgresql",
                postgres.getHost(), postgres.getMappedPort(5432),
                postgres.getDatabaseName(), postgres.getUsername(), postgres.getPassword(), 2
        );
    }
}