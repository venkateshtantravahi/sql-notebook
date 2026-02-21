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
                db.local_mysql.type=mysql
                db.local_mysql.host=localhost
                db.local_mysql.port=3306
                db.local_mysql.database=myapp
                db.local_mysql.user=root
                db.local_mysql.password=secret
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
         db.local_mysql.type=mysql
         db.local_mysql.host=localhost
         db.local_mysql.port=3306
         db.local_mysql.database=myapp
         db.local_mysql.user=root
         db.local_mysql.password=secret
    
         db.analytics_pg.type=postgres
         db.analytics_pg.host=localhost
         db.analytics_pg.port=5432
         db.analytics_pg.database=analytics
         db.analytics_pg.user=analyst
         db.analytics_pg.password=secret
         db.analytics_pg.pool.size=10
        """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());

        assertEquals(2, result.size());
        assertEquals(10, result.get("analytics_pg").poolSize());
    }

    @Test
    void throwsOnMissingRequiredFields() throws IOException {
        Path file = writeProps("""
            db.local_mysql.type=mysql
            db.local_mysql.port=3306
            db.local_mysql.database=myapp
            db.local_mysql.user=root
            db.local_mysql.password=secret
        """);

        ConfigException ex = assertThrows(ConfigException.class, () -> parser.parse(file.toString()));
        assertTrue(ex.getMessage().contains("host"));
    }

    @Test
    void throwsOnUnsupportedType() throws IOException {
        Path file = writeProps("""
            db.local_oracle.type=ibm-db2
            db.local_oracle.host=localhost
            db.local_oracle.port=1521
            db.local_oracle.database=myapp
            db.local_oracle.user=root
            db.local_oracle.password=secret
        """);
        ConfigException ex = assertThrows(ConfigException.class, () -> parser.parse(file.toString()));
        assertTrue(ex.getMessage().contains("Unsupported type"));
    }

    @Test
    void throwsWhenFileNotFound() throws IOException {
        ConfigException ex = assertThrows(ConfigException.class,
                () -> parser.parse("/nonexistent/sql.properties"));
        assertTrue(ex.getMessage().contains("not found"));
    }

    @Test
    void defaultPoolSizeAppliedWhenMissing() throws IOException {
        Path file = writeProps("""
            db.local_mysql.type=mysql
            db.local_mysql.host=localhost
            db.local_mysql.port=3306
            db.local_mysql.database=myapp
            db.local_mysql.user=root
            db.local_mysql.password=secret
        """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());
        assertEquals(5, result.get("local_mysql").poolSize());
    }

    @Test
    void parseSingleOracleConnection() throws IOException {
        Path file = writeProps("""
                db.local_oracle.type=oracle
                db.local_oracle.host=localhost
                db.local_oracle.port=1521
                db.local_oracle.database=myapp
                db.local_oracle.user=admin
                db.local_oracle.password=secret
                """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());
        assertNotNull(result.get("local_oracle"));
        assertEquals("oracle", result.get("local_oracle").type());
    }

    @Test
    void parseSingleSqliteConnection() throws IOException {
        Path file = writeProps("""
                db.local_sqlite.type=sqlite
                db.local_sqlite.host=localhost
                db.local_sqlite.port=0
                db.local_sqlite.database=mydb.sqlite
                db.local_sqlite.user=admin
                db.local_sqlite.password=secret
                """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());
        assertNotNull(result.get("local_sqlite"));
        assertEquals("sqlite", result.get("local_sqlite").type());
    }

    @Test
    void parseSingleMssqlConnection() throws IOException {
        Path file = writeProps("""
                db.local_mssql.type=microsoft-sql-server
                db.local_mssql.host=localhost
                db.local_mssql.port=1433
                db.local_mssql.database=myapp
                db.local_mssql.user=sa
                db.local_mssql.password=secret
                """);

        Map<String, ConnectionConfig> result = parser.parse(file.toString());
        assertNotNull(result.get("local_mssql"));
        assertEquals("microsoft-sql-server", result.get("local_mssql").type());
    }

    private int DEFAULT_POOL_SIZE() {
        return 5;
    }
}
