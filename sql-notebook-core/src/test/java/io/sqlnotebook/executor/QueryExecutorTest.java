package io.sqlnotebook.executor;


import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.ConnectionRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.Map;
import java.util.concurrent.Future;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class QueryExecutorTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:13");

    private ConnectionRegistry registry;
    private QueryExecutor executor;

    @BeforeEach
    void setUp() throws Exception {
        registry = new ConnectionRegistry(Map.of("pg", postgresConfig()));
        executor = new QueryExecutor(registry);

        try (var conn = registry.getConnection("pg");
             var stmt = conn.createStatement()) {
            stmt.execute("CREATE TABLE IF NOT EXISTS users (id INT, name TEXT)");
            stmt.execute("INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob')");
        }
    }

    @AfterEach
    void tearDown() throws Exception {
        try (var conn = registry.getConnection("pg");
             var stmt = conn.createStatement()) {
            stmt.execute("DROP TABLE IF EXISTS users");
        }
        executor.shutdown();
        registry.shutdown();
    }

    @Test
    void shouldReturnColumnsAndRows() throws Exception {
        Future<QueryResult> future = executor.execute("pg", "SELECT id, name FROM users ORDER BY id");
        QueryResult result = future.get();

        assertTrue(result.success());
        assertEquals(2, result.columns().size());
        assertEquals(2, result.rows().size());
        assertEquals("Alice", result.rows().get(0).get(1));
    }

    @Test
    void shouldReturnFailureForInvalidQuery() throws Exception {
        Future<QueryResult> future = executor.execute("pg", "SELECT * FROM nonexistent");
        QueryResult result = future.get();

        assertFalse(result.success());
        assertNotNull(result.errorMessage());
    }

    @Test
    void shouldReturnEmptyRowsForNoResults() throws Exception {
        Future<QueryResult> future = executor.execute("pg", "SELECT * FROM users WHERE id = 999");
        QueryResult result = future.get();

        assertTrue(result.success());
        assertEquals(0, result.rows().size());
    }

    @Test
    void shouldRunTwoQueriesInParallel() throws Exception {
        Future<QueryResult> f1 = executor.execute("pg", "SELECT * FROM users WHERE id = 1");
        Future<QueryResult> f2 = executor.execute("pg", "SELECT * FROM users WHERE id = 2");

        QueryResult r1 = f1.get();
        QueryResult r2 = f2.get();

        assertTrue(r1.success());
        assertTrue(r2.success());
        assertEquals(1, r1.rows().size());
        assertEquals(1, r2.rows().size());
    }

    @Test
    void shouldTrackExecutionTime() throws Exception {
        Future<QueryResult> future = executor.execute("pg", "SELECT * FROM users");
        QueryResult result = future.get();

        assertTrue(result.executionTimeMs() >= 0);
    }

    // helper

    private ConnectionConfig postgresConfig() {
        return new ConnectionConfig(
                "pg", "postgresql",
                postgres.getHost(), postgres.getMappedPort(5432),
                postgres.getDatabaseName(), postgres.getUsername(), postgres.getPassword(), 4
        );
    }
}
