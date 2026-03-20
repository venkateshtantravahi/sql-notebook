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
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class SchemaHandlerTest {

    @Container
    static MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.0")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:13")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @TempDir
    Path tempDir;

    private HttpServer server;
    private HttpClient http;
    private ObjectMapper mapper;
    private int port;

    @BeforeEach
    void setUp() throws Exception {
        // Create test tables in MySQL
        try (var conn = mysql.createConnection("")) {
            conn.createStatement().execute("""
                CREATE TABLE IF NOT EXISTS customers (
                    customerID INT PRIMARY KEY,
                    firstName VARCHAR(100),
                    lastName VARCHAR(100)
                )
            """);
            conn.createStatement().execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    orderID INT PRIMARY KEY,
                    customerID INT,
                    FOREIGN KEY (customerID) REFERENCES customers(customerID)
                )
            """);
        }

        // Create test tables in Postgres
        try (var conn = postgres.createConnection("")) {
            conn.createStatement().execute("""
                CREATE TABLE IF NOT EXISTS products (
                    productID SERIAL PRIMARY KEY,
                    category VARCHAR(100),
                    price DECIMAL(10,2)
                )
            """);
        }

        Map<String, ConnectionConfig> configs = Map.of(
                "mysql_ns", new ConnectionConfig(
                        "mysql_ns", "mysql",
                        mysql.getHost(), mysql.getMappedPort(3306),
                        mysql.getDatabaseName(), mysql.getUsername(), mysql.getPassword(), 5
                ),
                "pg_ns", new ConnectionConfig(
                        "pg_ns", "postgresql",
                        postgres.getHost(), postgres.getMappedPort(5432),
                        postgres.getDatabaseName(), postgres.getUsername(), postgres.getPassword(), 5
                )
        );

        ConnectionRegistry registry = new ConnectionRegistry(configs);
        DuckDbRegistrar registrar = new DuckDbRegistrar(registry);
        FileSourceRegistry sourceRegistry = new FileSourceRegistry(registrar);
        QueryExecutor executor = new QueryExecutor(registry);
        PinnedViewRegistry pinnedRegistry = new PinnedViewRegistry(registry, tempDir.resolve("pinned").toString());
        server = new HttpServer(0, registry, executor, sourceRegistry, registrar, pinnedRegistry, 0, System.getProperty("user.dir"));
        server.start();
        port = server.getPort();

        http   = HttpClient.newHttpClient();
        mapper = new ObjectMapper();
    }

    @AfterEach
    void tearDown() throws Exception {
        server.stop();
    }

    @Test
    void returnsSchemaForMysqlNamespace() throws Exception {
        HttpResponse<String> resp = http.send(
                HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + "/schema/mysql_ns"))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString()
        );

        assertEquals(200, resp.statusCode());

        JsonNode root = mapper.readTree(resp.body());
        assertEquals("mysql_ns", root.get("namespace").asString());

        JsonNode tables = root.get("tables");
        assertTrue(tables.isArray());
        assertTrue(tables.size() >= 2);

        JsonNode customers = findTable(tables, "customers");
        assertNotNull(customers, "customers table should exist");

        JsonNode columns    = customers.get("columns");
        JsonNode customerIdCol = findColumn(columns, "customerID");
        assertNotNull(customerIdCol);
        assertTrue(customerIdCol.get("primaryKey").asBoolean());
        assertFalse(customerIdCol.get("foreignKey").asBoolean());
    }

    @Test
    void returnsForeignKeyForOrdersTable() throws Exception {
        HttpResponse<String> resp = http.send(
                HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + "/schema/mysql_ns"))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString()
        );

        JsonNode root   = mapper.readTree(resp.body());
        JsonNode tables = root.get("tables");

        JsonNode orders = findTable(tables, "orders");
        assertNotNull(orders, "orders table should exist");

        JsonNode customerIdCol = findColumn(orders.get("columns"), "customerID");
        assertNotNull(customerIdCol);
        assertFalse(customerIdCol.get("primaryKey").asBoolean());
        assertTrue(customerIdCol.get("foreignKey").asBoolean());
    }

    @Test
    void returnsSchemaForPostgresNamespace() throws Exception {
        HttpResponse<String> resp = http.send(
                HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + "/schema/pg_ns"))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString()
        );

        assertEquals(200, resp.statusCode());

        JsonNode root = mapper.readTree(resp.body());
        assertEquals("pg_ns", root.get("namespace").asString());

        JsonNode tables   = root.get("tables");
        JsonNode products = findTable(tables, "products");
        assertNotNull(products, "products table should exist");

        JsonNode productIdCol = findColumn(products.get("columns"), "productid");
        if (productIdCol == null) {
            productIdCol = findColumn(products.get("columns"), "productID");
        }
        assertNotNull(productIdCol);
        assertTrue(productIdCol.get("primaryKey").asBoolean());
    }

    @Test
    void returns404ForUnknownNamespace() throws Exception {
        HttpResponse<String> resp = http.send(
                HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + "/schema/unknown"))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString()
        );
        assertEquals(404, resp.statusCode());
    }

    @Test
    void returns400WhenNamespaceMissing() throws Exception {
        HttpResponse<String> resp = http.send(
                HttpRequest.newBuilder()
                        .uri(URI.create("http://localhost:" + port + "/schema/"))
                        .GET().build(),
                HttpResponse.BodyHandlers.ofString()
        );
        assertEquals(400, resp.statusCode());
    }

    // helpers

    private JsonNode findTable(JsonNode tables, String name) {
        for (JsonNode table : tables) {
            if (table.get("name").asString().equalsIgnoreCase(name)) return table;
        }
        return null;
    }

    private JsonNode findColumn(JsonNode columns, String name) {
        for (JsonNode col : columns) {
            if (col.get("name").asString().equalsIgnoreCase(name)) return col;
        }
        return null;
    }
}

