package io.sqlnotebook.server;

import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests ProfilerService across multiple database engines.
 *
 * DuckDB and SQLite are tested in-process (no containers).
 * MySQL is tested via Testcontainers to verify backtick quoting, exact row counts,
 * and the sampling path.
 */
@Testcontainers
class ProfilerServiceTest {

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

    private final ProfilerService service = new ProfilerService();

    // DuckDB — native SUMMARIZE path

    @Test
    void duckDbProfileReturnsColumnStats() throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:duckdb:")) {
            conn.createStatement().execute(
                    "CREATE TABLE items (id BIGINT, name VARCHAR, price DOUBLE)");
            conn.createStatement().execute(
                    "INSERT INTO items VALUES (1,'apple',1.5),(2,'banana',0.99),(3,NULL,2.0)");

            List<ProfilerService.ColumnProfile> cols = service.profile(conn, "items");

            assertEquals(3, cols.size());

            ProfilerService.ColumnProfile id = findCol(cols, "id");
            assertNotNull(id);
            assertEquals(3L, id.rowCount());
            assertEquals(0L, id.nullCount());
            assertEquals(0.0, id.nullPct(), 0.01);
            assertEquals(3L, id.approxDistinct());
            assertEquals("1", id.min());
            assertEquals("3", id.max());

            ProfilerService.ColumnProfile name = findCol(cols, "name");
            assertNotNull(name);
            assertEquals(1L, name.nullCount());
            assertTrue(name.nullPct() > 0);
        }
    }

    @Test
    void duckDbProfileIncludesMeanAndStd() throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:duckdb:")) {
            conn.createStatement().execute(
                    "CREATE TABLE nums (val DOUBLE)");
            conn.createStatement().execute(
                    "INSERT INTO nums VALUES (10.0),(20.0),(30.0)");

            List<ProfilerService.ColumnProfile> cols = service.profile(conn, "nums");
            ProfilerService.ColumnProfile val = findCol(cols, "val");

            assertNotNull(val);
            assertFalse(val.mean().isEmpty(), "mean should be populated for DuckDB");
            assertFalse(val.std().isEmpty(), "std should be populated for DuckDB");
        }
    }

    @Test
    void duckDbDiscoverTablePrefersDataView() throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:duckdb:")) {
            conn.createStatement().execute("CREATE TABLE raw (x INT)");
            conn.createStatement().execute("CREATE VIEW data AS SELECT * FROM raw");

            String discovered = service.discoverTable(conn);
            assertEquals("data", discovered, "should prefer the 'data' view");
        }
    }

    @Test
    void duckDbDiscoverTableFallsBackToFirstTable() throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:duckdb:")) {
            conn.createStatement().execute("CREATE TABLE zebra (x INT)");
            conn.createStatement().execute("CREATE TABLE alpha (x INT)");

            String discovered = service.discoverTable(conn);
            assertEquals("alpha", discovered, "should return first table alphabetically");
        }
    }

    @Test
    void duckDbDiscoverTableReturnsNullWhenEmpty() throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:duckdb:")) {
            String discovered = service.discoverTable(conn);
            assertNull(discovered);
        }
    }

    // SQLite — generic path with double-quote identifier quoting

    @Test
    void sqliteProfileReturnsColumnStats() throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:sqlite::memory:")) {
            conn.createStatement().execute(
                    "CREATE TABLE products (id INTEGER, label TEXT, qty INTEGER)");
            conn.createStatement().execute(
                    "INSERT INTO products VALUES (1,'widget',10),(2,NULL,5),(3,'gadget',NULL)");

            List<ProfilerService.ColumnProfile> cols = service.profile(conn, "products");

            assertEquals(3, cols.size());

            ProfilerService.ColumnProfile label = findCol(cols, "label");
            assertNotNull(label);
            assertEquals(3L, label.rowCount());
            assertEquals(1L, label.nullCount());
            assertEquals("widget", label.max());  // 'w' > 'g' alphabetically

            // Generic path leaves mean/std empty
            assertEquals("", label.mean());
            assertEquals("", label.std());
        }
    }

    @Test
    void sqliteDiscoverTableReturnsFirstTable() throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:sqlite::memory:")) {
            conn.createStatement().execute("CREATE TABLE alpha (x INT)");
            conn.createStatement().execute("CREATE TABLE beta  (x INT)");

            String discovered = service.discoverTable(conn);
            assertEquals("alpha", discovered);
        }
    }

    @Test
    void sqliteProfileEmptyTableReturnsColumns() throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:sqlite::memory:")) {
            conn.createStatement().execute("CREATE TABLE empty_t (a TEXT, b INT)");

            List<ProfilerService.ColumnProfile> cols = service.profile(conn, "empty_t");

            assertEquals(2, cols.size());
            assertEquals(0L, cols.get(0).rowCount());
            assertEquals(0L, cols.get(0).nullCount());
            assertEquals(0L, cols.get(0).approxDistinct());
        }
    }

    // MySQL — generic path with backtick quoting

    @Test
    void mysqlProfileUsesBacktickQuotingCorrectly() throws Exception {
        try (Connection conn = DriverManager.getConnection(
                mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())) {
            conn.createStatement().execute(
                    "CREATE TABLE IF NOT EXISTS orders " +
                    "(order_id INT, status VARCHAR(50), amount DECIMAL(10,2))");
            conn.createStatement().execute(
                    "INSERT INTO orders VALUES (1,'shipped',99.99),(2,'pending',NULL),(3,'shipped',45.0)");

            List<ProfilerService.ColumnProfile> cols = service.profile(conn, "orders");

            assertEquals(3, cols.size());

            ProfilerService.ColumnProfile status = findCol(cols, "status");
            assertNotNull(status);
            assertEquals(3L, status.rowCount());
            assertEquals(0L, status.nullCount());
            assertEquals(2L, status.approxDistinct());

            ProfilerService.ColumnProfile amount = findCol(cols, "amount");
            assertNotNull(amount);
            assertEquals(1L, amount.nullCount());

            // MySQL generic path: mean/std are empty
            assertEquals("", amount.mean());
            assertEquals("", amount.std());

            conn.createStatement().execute("DROP TABLE IF EXISTS orders");
        }
    }

    @Test
    void mysqlDiscoverTableReturnsFirstBaseTable() throws Exception {
        try (Connection conn = DriverManager.getConnection(
                mysql.getJdbcUrl(), mysql.getUsername(), mysql.getPassword())) {
            conn.createStatement().execute("CREATE TABLE IF NOT EXISTS aaa_first (x INT)");
            conn.createStatement().execute("CREATE TABLE IF NOT EXISTS zzz_last  (x INT)");

            String discovered = service.discoverTable(conn);
            assertNotNull(discovered);
            assertEquals("aaa_first", discovered);

            conn.createStatement().execute("DROP TABLE IF EXISTS aaa_first");
            conn.createStatement().execute("DROP TABLE IF EXISTS zzz_last");
        }
    }

    // PostgreSQL — generic path with double-quote quoting

    @Test
    void postgresProfileReturnsColumnStats() throws Exception {
        try (Connection conn = DriverManager.getConnection(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {
            conn.createStatement().execute(
                    "CREATE TABLE IF NOT EXISTS pg_items " +
                    "(id SERIAL, name TEXT, score NUMERIC)");
            conn.createStatement().execute(
                    "INSERT INTO pg_items(name, score) VALUES ('x',1.0),('y',NULL),('z',3.0)");

            List<ProfilerService.ColumnProfile> cols = service.profile(conn, "pg_items");

            assertFalse(cols.isEmpty());

            ProfilerService.ColumnProfile score = findCol(cols, "score");
            assertNotNull(score);
            assertEquals(1L, score.nullCount());

            conn.createStatement().execute("DROP TABLE IF EXISTS pg_items");
        }
    }

    // helpers

    private ProfilerService.ColumnProfile findCol(List<ProfilerService.ColumnProfile> cols, String name) {
        return cols.stream()
                .filter(c -> c.name().equalsIgnoreCase(name))
                .findFirst()
                .orElse(null);
    }
}
