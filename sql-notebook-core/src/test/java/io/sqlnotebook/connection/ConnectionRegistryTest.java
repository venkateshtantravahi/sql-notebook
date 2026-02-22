package io.sqlnotebook.connection;

import io.sqlnotebook.config.ConnectionConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.testcontainers.containers.MSSQLServerContainer;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.oracle.OracleContainer;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class ConnectionRegistryTest {

    @Container
    static MySQLContainer<?> mysql = new MySQLContainer<>("mysql:8.0");

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:13");

    @Container
    static MSSQLServerContainer<?> mssql = new MSSQLServerContainer<>("mcr.microsoft.com/mssql/server:2022-latest")
            .acceptLicense();

    @Container
    static OracleContainer oracle = new OracleContainer("gvenzl/oracle-free:latest")
            .withUsername("testuser")
            .withPassword("testpass");

    @TempDir
    Path tempDir;

    private ConnectionRegistry registry;

    @AfterEach
    void tearDown() {
        if (registry != null) registry.shutdown();
    }

    @Test
    void shouldConnectToMysqlNamespace() throws Exception {
        registry = new ConnectionRegistry(Map.of(
                "local_mysql", mysqlConfig()
        ));

        try (Connection conn = registry.getConnection("local_mysql");
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT 1")) {
            assertTrue(rs.next());
        }
    }

    @Test
    void shouldConnectToPostgresNamespace() throws Exception {
        registry = new ConnectionRegistry(Map.of(
                "local_pg", postgresConfig()
        ));

        try (Connection conn = registry.getConnection("local_pg");
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT 1")) {
            assertTrue(rs.next());
        }
    }

    @Test
    void shouldConnectToMssqlNamespace() throws Exception {
        registry = new ConnectionRegistry(Map.of("local_mssql", mssqlConfig()));
        try (Connection conn = registry.getConnection("local_mssql");
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT 1")) {
            assertTrue(rs.next());
        }
    }

    @Test
    void shouldConnectToOracleNamespace() throws Exception {
        registry = new ConnectionRegistry(Map.of("local_oracle", oracleConfig()));
        try (Connection conn = registry.getConnection("local_oracle");
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT 1 FROM DUAL")) {
            assertTrue(rs.next());
        }
    }

    @Test
    void shouldConnectToSqliteNamespace() throws Exception {
        String dbPath = tempDir.resolve("test.db").toString();
        registry = new ConnectionRegistry(Map.of("local_sqlite", sqliteConfig(dbPath)));
        try (Connection conn = registry.getConnection("local_sqlite");
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT 1")) {
            assertTrue(rs.next());
        }
    }

    @Test
    void shouldConnectToBothNamespacesIndependently() throws Exception {
        registry = new ConnectionRegistry(Map.of(
                "local_mysql", mysqlConfig(),
                "local_pg", postgresConfig()
        ));

        assertEquals(2, registry.getNamespaces().size());
        assertTrue(registry.getNamespaces().contains("local_mysql"));
        assertTrue(registry.getNamespaces().contains("local_pg"));
    }

    @Test
    void shouldThrowForUnknownNamespace() {
        registry = new ConnectionRegistry(Map.of(
                "local_mysql", mysqlConfig()
        ));

        ConnectionRegistryException ex = assertThrows(
                ConnectionRegistryException.class,
                () -> registry.getConnection("unknown")
        );
        assertTrue(ex.getMessage().contains("Unknown namespace"));
    }

    @Test
    void shouldShutdownCleanly() {
        registry = new ConnectionRegistry(Map.of(
                "local_mysql", mysqlConfig()
        ));
        assertDoesNotThrow(() -> registry.shutdown());
        assertEquals(0, registry.getNamespaces().size());
    }

    // --- helpers ---

    private ConnectionConfig mysqlConfig() {
        return new ConnectionConfig(
                "local_mysql", "mysql",
                mysql.getHost(), mysql.getMappedPort(3306),
                mysql.getDatabaseName(), mysql.getUsername(), mysql.getPassword(),
                2
        );
    }

    private ConnectionConfig postgresConfig() {
        return new ConnectionConfig(
                "local_pg", "postgres",
                postgres.getHost(), postgres.getMappedPort(5432),
                postgres.getDatabaseName(), postgres.getUsername(), postgres.getPassword(),
                2
        );
    }

    private ConnectionConfig mssqlConfig() {
        return new ConnectionConfig("local_mssql", "microsoft-sql-server",
                mssql.getHost(), mssql.getMappedPort(1433),
                "master", mssql.getUsername(), mssql.getPassword(), 2);
    }

    private ConnectionConfig oracleConfig() {
        return new ConnectionConfig("local_oracle", "oracle",
                oracle.getHost(), oracle.getMappedPort(1521),
                oracle.getDatabaseName(), oracle.getUsername(), oracle.getPassword(), 2);
    }

    private ConnectionConfig sqliteConfig(String dbPath) {
        return new ConnectionConfig("local_sqlite", "sqlite",
                "", 0, dbPath, "", "", 2);
    }
}
