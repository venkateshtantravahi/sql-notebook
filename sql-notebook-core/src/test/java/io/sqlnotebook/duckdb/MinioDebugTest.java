package io.sqlnotebook.duckdb;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.sqlnotebook.connection.ConnectionRegistry;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Collections;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Integration tests for the MinIO / S3 -> DuckDB registration path.
 *
 * Verifies three connection layers in isolation:
 *   1. Raw DriverManager with S3 JDBC properties (mirrors initialiseRemote)
 *   2. HikariCP with addDataSourceProperty (mirrors buildPoolWithProperties)
 *   3. Full DuckDbRegistrar.registerRemote + ConnectionRegistry end-to-end
 *
 * Requires a local MinIO instance. Override defaults via system properties:
 *   -Dminio.url, -Dminio.endpoint, -Dminio.region,
 *   -Dminio.accessKeyId, -Dminio.secretAccessKey
 */
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class MinioDebugTest {

    private static final String TEST_URL        = System.getProperty("minio.url",             "s3://imdb/title.principals.tsv");
    private static final String TEST_ENDPOINT   = System.getProperty("minio.endpoint",        "http://localhost:9000");
    private static final String TEST_REGION     = System.getProperty("minio.region",          "us-east-1");
    private static final String TEST_ACCESS_KEY = System.getProperty("minio.accessKeyId",     "minioadmin");
    private static final String TEST_SECRET_KEY = System.getProperty("minio.secretAccessKey", "minioadmin");

    @TempDir
    static Path tempDir;

    private static String jdbcUrl;

    @BeforeAll
    static void setup() {
        jdbcUrl = "jdbc:duckdb:" + tempDir.resolve("minio_debug.db");
        assumeTrue(isMinioReachable(),
                "MinIO not reachable at " + TEST_ENDPOINT + "  -  skipping S3 integration tests");
    }

    /**
     * Returns true if the MinIO endpoint responds within 2 seconds.
     * Used to skip the entire test class in CI where MinIO is not running.
     */
    private static boolean isMinioReachable() {
        try {
            HttpURLConnection conn = (HttpURLConnection)
                    URI.create(TEST_ENDPOINT).toURL().openConnection();
            conn.setConnectTimeout(2_000);
            conn.setReadTimeout(2_000);
            conn.setRequestMethod("HEAD");
            conn.connect();
            conn.disconnect();
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    @Test
    @Order(1)
    void rawJdbc_s3PropsReachDuckDbSession() throws Exception {
        Properties props = buildS3Props();

        try (Connection conn = DriverManager.getConnection(jdbcUrl, props);
             Statement stmt = conn.createStatement()) {

            stmt.execute("INSTALL httpfs");
            stmt.execute("LOAD httpfs");

            try (ResultSet rs = stmt.executeQuery("SELECT current_setting('s3_endpoint') AS ep")) {
                assertTrue(rs.next());
                assertTrue(rs.getString("ep").contains("localhost:9000"),
                        "s3_endpoint not applied via JDBC properties. Got: " + rs.getString("ep"));
            }
        }
    }

    @Test
    @Order(2)
    void rawJdbc_canCreateViewAndQueryOverS3File() throws Exception {
        String readFn = readFunction(TEST_URL, inferExt(TEST_URL));
        Properties props = buildS3Props();

        try (Connection conn = DriverManager.getConnection(jdbcUrl, props);
             Statement stmt = conn.createStatement()) {

            stmt.execute("INSTALL httpfs");
            stmt.execute("LOAD httpfs");
            stmt.execute("CREATE OR REPLACE VIEW \"debug_view\" AS SELECT * FROM " + readFn);

            try (ResultSet rs = stmt.executeQuery("SELECT count(*) FROM debug_view")) {
                assertTrue(rs.next());
                assertTrue(rs.getLong(1) > 0, "Expected rows from S3 file but got 0");
            }
        }
    }

    @Test
    @Order(3)
    void hikariAddDataSourceProperty_s3PropsAppliedToPooledConnections() throws Exception {
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(jdbcUrl);
        cfg.setPoolName("pool-s3-props-test");
        cfg.setMaximumPoolSize(1);
        cfg.setConnectionTimeout(5_000);
        buildS3Props().forEach((k, v) -> cfg.addDataSourceProperty(k.toString(), v.toString()));

        try (HikariDataSource ds = new HikariDataSource(cfg);
             Connection conn = ds.getConnection();
             Statement stmt = conn.createStatement()) {

            stmt.execute("LOAD httpfs");

            try (ResultSet rs = stmt.executeQuery("SELECT current_setting('s3_endpoint') AS ep")) {
                assertTrue(rs.next());
                assertTrue(rs.getString("ep").contains("localhost:9000"),
                        "addDataSourceProperty did not propagate s3_endpoint to pooled connection. Got: "
                                + rs.getString("ep"));
            }

            try (ResultSet rs = stmt.executeQuery("SELECT count(*) FROM \"debug_view\"")) {
                assertTrue(rs.next());
                assertTrue(rs.getLong(1) > 0, "Pooled connection could not read S3 view");
            }
        }
    }

    @Test
    @Order(4)
    void registerRemote_namespaceIsQueryableViaConnectionRegistry() throws Exception {
        ConnectionRegistry registry = new ConnectionRegistry(Collections.emptyMap());
        DuckDbRegistrar registrar = new DuckDbRegistrar(
                registry,
                tempDir.resolve("uploads").toString(),
                tempDir.resolve("duckdb").toString()
        );

        DuckDbRegistrar.S3Config s3 = new DuckDbRegistrar.S3Config(
                TEST_ENDPOINT, TEST_REGION, TEST_ACCESS_KEY, TEST_SECRET_KEY
        );

        String namespace = registrar.registerRemote(TEST_URL, "minio_test", s3);

        assertTrue(registry.hasNamespace(namespace));

        try (Connection conn = registry.getConnection(namespace);
             Statement stmt = conn.createStatement()) {

            stmt.execute("LOAD httpfs");

            try (ResultSet rs = stmt.executeQuery("SELECT count(*) FROM \"" + namespace + "\"")) {
                assertTrue(rs.next());
                assertTrue(rs.getLong(1) > 0,
                        "Namespace registered but query returned 0 rows  -  S3 credentials may not be reaching the pool");
            }
        } finally {
            registry.shutdown();
        }
    }

    private static Properties buildS3Props() {
        Properties p = new Properties();
        p.setProperty("s3_endpoint", TEST_ENDPOINT.replaceFirst("^https?://", ""));
        p.setProperty("s3_url_style", "path");
        if (TEST_ENDPOINT.startsWith("http://")) {
            p.setProperty("s3_use_ssl", "false");
        }
        p.setProperty("s3_region", TEST_REGION);
        p.setProperty("s3_access_key_id", TEST_ACCESS_KEY);
        p.setProperty("s3_secret_access_key", TEST_SECRET_KEY);
        return p;
    }

    private static String inferExt(String url) {
        String path = url.contains("?") ? url.substring(0, url.indexOf('?')) : url;
        if (path.endsWith(".gz") || path.endsWith(".bz2") || path.endsWith(".zst")) {
            path = path.substring(0, path.lastIndexOf('.'));
        }
        int dot = path.lastIndexOf('.');
        if (dot < 0 || dot < path.lastIndexOf('/')) return "parquet";
        return path.substring(dot + 1).toLowerCase();
    }

    private static String readFunction(String url, String ext) {
        String q = "'" + url + "'";
        return switch (ext) {
            case "csv", "tsv"     -> "read_csv_auto(%s)".formatted(q);
            case "json", "ndjson" -> "read_json_auto(%s)".formatted(q);
            case "parquet"        -> "read_parquet(%s)".formatted(q);
            default               -> "read_csv_auto(%s)".formatted(q);
        };
    }
}
