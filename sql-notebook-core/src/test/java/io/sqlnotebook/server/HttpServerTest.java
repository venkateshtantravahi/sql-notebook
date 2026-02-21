package io.sqlnotebook.server;

import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.executor.QueryExecutor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class HttpServerTest {

    @Container
    static PostgreSQLContainer<?> postgres =  new PostgreSQLContainer<>("postgres:13");

    private ConnectionRegistry registry;
    private QueryExecutor executor;
    private HttpServer server;
    private HttpClient client;

    private static final int PORT = 18080;

    @BeforeEach
    void setUp() throws Exception {
        registry = new ConnectionRegistry(Map.of("pg", postgresConfig()));
        executor = new QueryExecutor(registry, 4);
        server = new HttpServer(PORT, registry, executor);
        server.start();
        client = HttpClient.newHttpClient();

        try (var conn = registry.getConnection("pg");
             var stmt = conn.createStatement())  {
            stmt.execute("CREATE TABLE IF NOT EXISTS users (id INT, name TEXT)");
            stmt.execute("INSERT INTO users VALUES(1, 'Alice'), (2, 'Bob')");
        }
    }

    @AfterEach
    void tearDown() throws Exception {
        try (var conn = registry.getConnection("pg");
        var stmt = conn.createStatement()) {
            stmt.execute("DROP TABLE IF EXISTS users");
        }
        server.stop();
        executor.shutdown();
        registry.shutdown();
    }

    @Test
    void shouldReturnNamespaces() throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/namespaces"))
                .GET()
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains("pg"));
    }

    @Test
    void shouldExecuteValidQuery() throws Exception {
        String body = """
                {"namespace":"pg","sql":"SELECT * FROM users ORDER BY id"}
                """;

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/query"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains("true"));
        assertTrue(res.body().contains("Alice"));
    }

    @Test
    void shouldReturn400ForMissingFields() throws Exception {
        String body = """
                {"namespace":"pg"}
        """;

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/query"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(400, res.statusCode());
    }

    @Test
    void shouldReturn404ForUnknownNamespace() throws Exception {
        String body = """
                {"namespace":"unknown", "sql":"SELECT 1"}
        """;

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/query"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(404, res.statusCode());
    }

    private ConnectionConfig postgresConfig() {
        return new ConnectionConfig("pg", "postgres",
                postgres.getHost(), postgres.getMappedPort(5432),
                postgres.getDatabaseName(), postgres.getUsername(), postgres.getPassword(), 4);
    }
}
