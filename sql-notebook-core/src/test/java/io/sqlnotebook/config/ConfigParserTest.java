package io.sqlnotebook.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class ConfigParserTest {

    private final ConfigParser parser = new ConfigParser();

    @TempDir
    Path tempDir;

    private Path writeProps(String content) throws IOException {
        Path file = tempDir.resolve("sql.properties");
        Files.writeString(file, content);
        return file;
    }

    @Test
    void parseSingleMysqlConnection() throws IOException {
        Path file = writeProps("""
                local_mysql.type=mysql
                local_mysql.host=localhost
                local_mysql.port=3306
                local_mysql.database=myapp
                local_mysql.username=root
                local_mysql.password=secret
                """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());

        assertEquals(1, result.size());
        ConnectionConfig config = result.get("local_mysql");
        assertNotNull(config);
        assertEquals("mysql", config.type());
        assertEquals("localhost", config.host());
        assertEquals(3306, config.port());
        assertEquals(DEFAULT_POOL_SIZE(), config.poolSize());
    }

    @Test
    void parseTwoConnections() throws IOException {
        Path file = writeProps("""
                local_mysql.type=mysql
                local_mysql.host=localhost
                local_mysql.port=3306
                local_mysql.database=myapp
                local_mysql.username=root
                local_mysql.password=secret

                analytics_pg.type=postgresql
                analytics_pg.host=localhost
                analytics_pg.port=5432
                analytics_pg.database=analytics
                analytics_pg.username=analyst
                analytics_pg.password=secret
                """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());

        assertEquals(2, result.size());
        assertNotNull(result.get("local_mysql"));
        assertNotNull(result.get("analytics_pg"));
    }

    @Test
    void throwsOnMissingRequiredFields() throws IOException {
        Path file = writeProps("""
                    local_mysql.type=mysql
                    local_mysql.port=3306
                    local_mysql.database=myapp
                    local_mysql.username=root
                    local_mysql.password=secret
                """);

        ConfigException ex = assertThrows(ConfigException.class, () -> parser.parse(file.toString()));
        assertTrue(ex.getMessage().contains("host"));
    }

    @Test
    void throwsOnUnsupportedType() throws IOException {
        Path file = writeProps("""
                    local_oracle.type=ibm-db2
                    local_oracle.host=localhost
                    local_oracle.port=1521
                    local_oracle.database=myapp
                    local_oracle.username=root
                    local_oracle.password=secret
                """);
        ConfigException ex = assertThrows(ConfigException.class, () -> parser.parse(file.toString()));
        assertTrue(ex.getMessage().contains("Unsupported type"));
    }

    @Test
    void returnsEmptyMapWhenFileNotFound() {
        // New behaviour — missing file is not an error, app starts with no connections
        Map<String, ConnectionConfig> result = parser.parse("/nonexistent/sql.properties");
        assertNotNull(result);
        assertTrue(result.isEmpty());
    }

    @Test
    void defaultPoolSizeAppliedWhenMissing() throws IOException {
        Path file = writeProps("""
                    local_mysql.type=mysql
                    local_mysql.host=localhost
                    local_mysql.port=3306
                    local_mysql.database=myapp
                    local_mysql.username=root
                    local_mysql.password=secret
                """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());
        assertEquals(5, result.get("local_mysql").poolSize());
    }

    @Test
    void parseSingleOracleConnection() throws IOException {
        Path file = writeProps("""
                local_oracle.type=oracle
                local_oracle.host=localhost
                local_oracle.port=1521
                local_oracle.database=myapp
                local_oracle.username=admin
                local_oracle.password=secret
                """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());
        assertNotNull(result.get("local_oracle"));
        assertEquals("oracle", result.get("local_oracle").type());
    }

    @Test
    void parseSingleSqliteConnection() throws IOException {
        Path file = writeProps("""
                local_sqlite.type=sqlite
                local_sqlite.database=mydb.sqlite
                """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());
        assertNotNull(result.get("local_sqlite"));
        assertEquals("sqlite", result.get("local_sqlite").type());
    }

    @Test
    void parseSingleMssqlConnection() throws IOException {
        Path file = writeProps("""
                local_mssql.type=microsoft-sql-server
                local_mssql.host=localhost
                local_mssql.port=1433
                local_mssql.database=myapp
                local_mssql.username=sa
                local_mssql.password=secret
                """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());
        assertNotNull(result.get("local_mssql"));
        assertEquals("microsoft-sql-server", result.get("local_mssql").type());
    }

    private int DEFAULT_POOL_SIZE() {
        return 5;
    }
}
