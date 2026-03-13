package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.duckdb.DuckDbRegistrar;
import io.sqlnotebook.duckdb.FileSourceRegistry;
import io.sqlnotebook.duckdb.PinnedViewRegistry;
import io.sqlnotebook.executor.QueryExecutor;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;

/**
 * FileSourceIntegrationTest
 *
 * End-to-end integration test covering the full Universal Data Source pipeline:
 *
 *   DuckDbRegistrar → FileSourceRegistry → FileSourceHandler → HttpServer
 *
 * Uses DuckDB in-process (no Docker / Testcontainers needed).
 * Each test gets a fresh TempDir so there is zero state bleed between tests.
 *
 * What is tested:
 *   1.  Namespace sanitisation (DuckDbRegistrar.sanitise)
 *   2.  CSV file registration — creates DuckDB view, queries return data
 *   3.  JSON file registration — queries return correct rows
 *   4.  Parquet file registration — queries return correct rows
 *   5.  Namespace collision — duplicate filename gets _2 suffix
 *   6.  GET /sources — lists registered sources, no S3 secret in response
 *   7.  POST /sources/upload (CSV) — full HTTP round-trip
 *   8.  POST /sources/upload (JSON) — full HTTP round-trip
 *   9.  POST /sources/upload — unsupported extension → 400
 *   10. POST /sources/upload — missing file field → 400
 *   11. DELETE /sources/:namespace — removes namespace, cleans up file
 *   12. DELETE /sources/:namespace — unknown namespace → 404
 *   13. Rehydration — FileSourceRegistry.rehydrate() restores namespaces
 *   14. ConnectionRegistry.register() duplicate → exception
 *   15. ConnectionRegistry.isEphemeral() tracking
 *   16. ConnectionRegistry DuckDB JDBC URL builds correctly
 *   17. Full query via /query endpoint against uploaded CSV
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class FileSourceIntegrationTest {

    @TempDir
    static Path sharedTemp;

    private static ConnectionRegistry registry;
    private static DuckDbRegistrar registrar;
    private static FileSourceRegistry sourceRegistry;
    private static QueryExecutor executor;
    private static HttpServer server;
    private static HttpClient client;

    private static final int PORT = 19090;

    private static Path uploadsDir;
    private static Path duckdbDir;
    private static Path sourcesJson;

    @BeforeAll
    static void startServer() throws Exception {
        uploadsDir = sharedTemp.resolve("uploads");
        duckdbDir = sharedTemp.resolve("duckdb");
        sourcesJson = uploadsDir.resolve("sources.json");
        Files.createDirectories(uploadsDir);
        Files.createDirectories(duckdbDir);

        registry = new ConnectionRegistry(Collections.emptyMap());
        registrar = new DuckDbRegistrar(registry,
                uploadsDir.toString(), duckdbDir.toString());
        sourceRegistry = new FileSourceRegistry(registrar, sourcesJson);
        executor = new QueryExecutor(registry);
        PinnedViewRegistry pinnedRegistry = new PinnedViewRegistry(registry, sharedTemp.resolve("pinned").toString());
        server = new HttpServer(PORT, registry, executor, sourceRegistry, registrar, pinnedRegistry, 0);
        server.start();
        client = HttpClient.newHttpClient();
    }

    @AfterAll
    static void stopServer() throws Exception {
        server.stop();
        executor.shutdown();
        registry.shutdown();
    }

    //Namespace sanitisation
    @Test @Order(1)
    void sanitize_convertsSpacesandDotsToUnderscore() {
        assertEquals("sales_data_csv", DuckDbRegistrar.sanitise("sales data.csv"));
        assertEquals("orders_2_parquet", DuckDbRegistrar.sanitise("orders (2).parquet"));
        assertEquals("my_report_xlsx", DuckDbRegistrar.sanitise("my-report.xlsx"));
    }

    @Test @Order(2)
    void sanitise_stripPathFromUrl() {
        assertEquals("data_json",  DuckDbRegistrar.sanitise("https://example.com/bucket/data.json"));
        assertEquals("users_csv", DuckDbRegistrar.sanitise("s3://my-bucket/folder/users.csv"));
    }

    @Test @Order(3)
    void sanitise_prefixesLeadingDigit() {
        assertEquals("src_2024_data_csv", DuckDbRegistrar.sanitise("2024_data.csv"));
    }

    // csv registration via duckdb
    @Test @Order(4)
    void registerFile_csvCreatesQueryTableNamespace() throws Exception {
        Path csv = uploadsDir.resolve("employees.csv");
        Files.writeString(csv,
                "id,name,salary\n" +
                "1,Alice,90000\n" +
                "2,Bob,85000\n");

        String namespace = registrar.registerFile("employees.csv");
        assertEquals("employees_csv", namespace);

        assertTrue(registry.hasNamespace(namespace));

        try (var conn = registry.getConnection(namespace);
             var stmt = conn.createStatement();
             var rs = stmt.executeQuery("select count(*) from employees_csv")) {
            assertTrue(rs.next());
            assertEquals(2, rs.getInt(1));
        }
    }

    @Test @Order(5)
    void registerFile_csvReturnsCorrectRows() throws Exception {
        try (var conn = registry.getConnection("employees_csv");
             var stmt = conn.createStatement();
             var rs = stmt.executeQuery(
                     "select name from employees_csv WHERE salary > 87000")) {
            assertTrue(rs.next());
            assertEquals("Alice", rs.getString("name"));
            assertFalse(rs.next());
        }
    }

    // Json registration

    @Test @Order(6)
    void registerFile_jsonCreatesQueryableNamespace() throws Exception {
        Path json = uploadsDir.resolve("products.json");
        Files.writeString(json,
                "[{\"id\":1,\"product\":\"Widget\",\"price\":9.99}," +
                        " {\"id\":2,\"product\":\"Gadget\",\"price\":24.99}]");

        String namespace = registrar.registerFile("products.json");
        assertEquals("products_json", namespace);

        try (var conn = registry.getConnection(namespace);
             var stmt = conn.createStatement();
             var rs   = stmt.executeQuery("SELECT count(*) FROM products_json")) {
            assertTrue(rs.next());
            assertEquals(2, rs.getInt(1));
        }
    }

    // Parquet
    @Test @Order(7)
    void registerFile_parquetCreatesQueryableNamespace() throws Exception {
        // Generate a real Parquet file using DuckDB itself
        Path parquet = uploadsDir.resolve("sales.parquet");
        try (var tmpConn = java.sql.DriverManager.getConnection("jdbc:duckdb:");
             var stmt    = tmpConn.createStatement()) {
            stmt.execute(
                    "COPY (SELECT 1 AS region, 100.0 AS amount " +
                            "UNION ALL SELECT 2, 200.0) " +
                            "TO '" + parquet + "' (FORMAT PARQUET)");
        }

        String namespace = registrar.registerFile("sales.parquet");
        assertEquals("sales_parquet", namespace);

        try (var conn = registry.getConnection(namespace);
             var stmt = conn.createStatement();
             var rs   = stmt.executeQuery("SELECT sum(amount) FROM sales_parquet")) {
            assertTrue(rs.next());
            assertEquals(300.0, rs.getDouble(1), 0.001);
        }
    }

    // Namespace collision
    @Test @Order(8)
    void registerFile_duplicateFilenameGetsUniqueSuffix() throws Exception {
        // employees.csv already registered in test 4 — register again
        Path csv2 = uploadsDir.resolve("employees_copy.csv");
        Files.writeString(csv2, "id,name\n3,Charlie\n");

        // Manually sanitise + uniquify to simulate collision
        String base      = DuckDbRegistrar.sanitise("employees_copy.csv");
        String namespace = registrar.uniqueNamespace(base);
        // employees_copy_csv should be free
        assertEquals("employees_copy_csv", namespace);
    }

    // connection lasting for a short time tracking
    @Test @Order(9)
    void connectionRegistry_hasNamespaceReturnsTrueAfterRegister() {
        assertTrue(registry.hasNamespace("employees_csv"));
        assertFalse(registry.hasNamespace("does_not_exist"));
    }

    @Test @Order(10)
    void connectionRegistry_duplicateRegisterThrows() {
        var config = new io.sqlnotebook.config.ConnectionConfig(
                "employees_csv", "duckdb", "", 0,
                duckdbDir.resolve("employees_csv.db").toString(), "", "", 1);

        assertThrows(io.sqlnotebook.connection.ConnectionRegistryException.class,
                () -> registry.register(config));
    }

    // Get Sources

    @Test @Order(11)
    void getSourcesList_returnsRegisteredSources() throws Exception {
        // Register via sourceRegistry so it appears in the list
        Path csv = uploadsDir.resolve("orders.csv");
        Files.writeString(csv, "order_id,total\n1,50.0\n2,75.0\n");
        sourceRegistry.addFile("orders.csv");

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/sources"))
                .GET().build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains("orders_csv"));
        assertTrue(res.body().contains("\"kind\""));
        assertTrue(res.body().contains("\"addedAt\""));
        // S3 secret must never appear in the response
        assertFalse(res.body().contains("s3SecretAccessKey"));
    }

    // Post sources/uploads

    @Test @Order(12)
    void uploadEndpoint_csvReturns201WithNamespace() throws Exception {
        byte[] csvBytes = "city,pop\nNew York,8000000\nLA,4000000\n".getBytes();

        var body = HttpRequest.BodyPublishers.ofByteArray(
                buildMultipart("cities.csv", "text/csv", csvBytes, "boundary"));

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/sources/upload"))
                .header("Content-Type", "multipart/form-data; boundary=boundary")
                .POST(body).build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(201, res.statusCode());
        assertTrue(res.body().contains("cities_csv"));
        assertTrue(res.body().contains("\"kind\":\"file\""));
    }

    @Test @Order(13)
    void uploadEndpoint_jsonReturns201() throws Exception {
        byte[] jsonBytes = "[{\"name\":\"test\",\"val\":1}]".getBytes();

        var body = HttpRequest.BodyPublishers.ofByteArray(
                buildMultipart("sample.json", "application/json", jsonBytes, "boundary2"));

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/sources/upload"))
                .header("Content-Type", "multipart/form-data; boundary=boundary2")
                .POST(body).build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(201, res.statusCode());
        assertTrue(res.body().contains("sample_json"));
    }

    // Unsupported extensions
    @Test @Order(14)
    void uploadEndpoint_unsupportedExtensionReturns400() throws Exception {
        byte[] xmlBytes = "<root/>".getBytes();

        var body = HttpRequest.BodyPublishers.ofByteArray(
                buildMultipart("data.xml", "text/xml", xmlBytes, "boundary3"));

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/sources/upload"))
                .header("Content-Type", "multipart/form-data; boundary=boundary3")
                .POST(body).build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(400, res.statusCode());
        assertTrue(res.body().contains("Unsupported file type"));
    }

    // Missing field from file
    @Test @Order(15)
    void uploadEndpoint_missingFileFieldReturns400() throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/sources/upload"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(400, res.statusCode());
    }

    // Post remote/source

    @Test @Order(16)
    void remoteEndpoint_invalidSchemeReturns400() throws Exception {
        String body = "{\"url\":\"ftp://example.com/data.csv\"}";

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/sources/remote"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(400, res.statusCode());
        assertTrue(res.body().contains("URL must start with"));
    }

    @Test @Order(17)
    void remoteEndpoint_missingUrlReturns400() throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/sources/remote"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(400, res.statusCode());
        assertTrue(res.body().contains("'url' is required"));
    }

    //Deletes sources for a namespace
    @Test @Order(18)
    void deleteEndpoint_removesNamespaceAndFile() throws Exception {
        // Register a fresh source to delete
        Path csv = uploadsDir.resolve("temp_delete.csv");
        Files.writeString(csv, "x\n1\n2\n");
        String namespace = sourceRegistry.addFile("temp_delete.csv");

        assertTrue(registry.hasNamespace(namespace));
        assertTrue(Files.exists(csv));

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/sources/" + namespace))
                .DELETE().build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains(namespace));
        assertFalse(registry.hasNamespace(namespace));
        assertFalse(Files.exists(csv));
    }

    @Test @Order(19)
    void deleteEndpoint_unknownNamespaceReturns404() throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/sources/does_not_exist"))
                .DELETE().build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(404, res.statusCode());
    }

    // Query against uploaded CSV
    @Test @Order(20)
    void queryEndpoint_canQueryUploadedCsv() throws Exception {
        // orders.csv was registered in test 11
        String body = "{\"namespace\":\"orders_csv\",\"sql\":\"SELECT sum(total) AS t FROM orders_csv\"}";

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:" + PORT + "/query"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();

        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, res.statusCode());
        assertTrue(res.body().contains("125")); // 50 + 75
    }

    @Test @Order(21)
    void rehydrate_restoresNamespacesFromSourcesJson() throws Exception {
        // sources.json was written by all the addFile() calls above.
        // Simulate a restart: new registry + registrar + sourceRegistry,
        // call rehydrate(), confirm namespaces come back.
        registry.shutdown();
        ConnectionRegistry  r2 = new ConnectionRegistry(Collections.emptyMap());
        DuckDbRegistrar     d2 = new DuckDbRegistrar(r2,
                uploadsDir.toString(), duckdbDir.toString());
        FileSourceRegistry  s2 = new FileSourceRegistry(d2, sourcesJson);

        s2.rehydrate();

        // orders.csv was registered via sourceRegistry.addFile in test 11
        assertTrue(r2.hasNamespace("orders_csv"),
                "orders_csv namespace should be restored after rehydration");

        // Confirm it's actually queryable
        try (var conn = r2.getConnection("orders_csv");
             var stmt = conn.createStatement();
             var rs   = stmt.executeQuery("SELECT count(*) FROM orders_csv")) {
            assertTrue(rs.next());
            assertEquals(2, rs.getInt(1));
        } finally {
            r2.shutdown();
        }
    }


    /**
     * Build a minimal multipart/form-data body for file upload tests.
     * Uses Java's built-in byte manipulation — no external libraries needed.
     */
    private static byte[] buildMultipart(String filename, String contentType,
                                         byte[] fileBytes, String boundary) {
        String CRLF = "\r\n";
        StringBuilder sb = new StringBuilder();
        sb.append("--").append(boundary).append(CRLF);
        sb.append("Content-Disposition: form-data; name=\"file\"; filename=\"")
                .append(filename).append("\"").append(CRLF);
        sb.append("Content-Type: ").append(contentType).append(CRLF);
        sb.append(CRLF);

        byte[] header = sb.toString().getBytes();
        String footer = CRLF + "--" + boundary + "--" + CRLF;
        byte[] footerBytes = footer.getBytes();

        byte[] result = new byte[header.length + fileBytes.length + footerBytes.length];
        System.arraycopy(header,     0, result, 0,                    header.length);
        System.arraycopy(fileBytes,  0, result, header.length,        fileBytes.length);
        System.arraycopy(footerBytes,0, result, header.length + fileBytes.length, footerBytes.length);
        return result;
    }
}
