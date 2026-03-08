package io.sqlnotebook.duckdb;

import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.ConnectionRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Locale;
import java.util.Set;

/**
 * DuckDbRegistrar
 *
 * Core engine for the Universal Data Source feature.
 * Responsible for:
 *   1. Building DuckDB JDBC URLs for local files and remote sources (S3 / HTTP)
 *   2. Loading required DuckDB extensions (httpfs, excel) on first connection
 *   3. Sanitising file/URL names into valid namespace identifiers
 *   4. Registering and deregistering DuckDB namespaces with ConnectionRegistry
 *
 * DuckDB connection model:
 *   Each file source gets its own DuckDB database file at:
 *     ~/.sqlnotebook/duckdb/<namespace>.db
 *
 *   This means each namespace is isolated — no cross-contamination between
 *   uploaded files. The database file persists across restarts, so DuckDB
 *   doesn't need to re-read the source file on every startup (it caches schema
 *   and stats). The source file itself lives in ~/.sqlnotebook/uploads/.
 *
 * Extension loading:
 *   DuckDB extensions are loaded once per database file on first connection.
 *   httpfs  — required for S3 and HTTP URL sources
 *   excel   — required for .xlsx files
 *   Both extensions are bundled with DuckDB 1.x — no separate download needed.
 *
 * S3 compatibility:
 *   Supports AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, Backblaze B2
 *   and any S3-compatible endpoint via the s3_endpoint config setting.
 */
public class DuckDbRegistrar {

    private static final Logger log = LoggerFactory.getLogger(DuckDbRegistrar.class);

    // DuckDB database files lives here - one .db file per namespace
    private static final String DEFAULT_DUCKDB_DIR =
            System.getProperty("user.home") + "/.sqlnotebook/duckdb/";

    private final String DUCKDB_DIR;

    // Source files (uploads) live here
    private static final String DEFAULT_UPLOAD_DIR =
            System.getProperty("user.home") + "/.sqlnotebook/uploads/";

    public final String  UPLOAD_DIR;

    // File extensions that need the excel extension loaded
    private static final Set<String> EXCEL_EXTENSIONS = Set.of("xlsx", "xls");

    // File extensions that DuckDb handles natively
    private static final Set<String> NATIVE_EXTENSIONS =
            Set.of("csv", "tsv", "json", "ndjson", "parquet", "arrow", "db", "sqlite");

    private final ConnectionRegistry registry;

    public DuckDbRegistrar(ConnectionRegistry registry) {
        this(registry, DEFAULT_UPLOAD_DIR, DEFAULT_DUCKDB_DIR);
    }

    public DuckDbRegistrar(ConnectionRegistry registry, String uploadsDir, String duckdbDir) {
        this.registry    = registry;
        this.UPLOAD_DIR = uploadsDir.endsWith("/") ? uploadsDir : uploadsDir + "/";
        this.DUCKDB_DIR  = duckdbDir.endsWith("/")  ? duckdbDir  : duckdbDir  + "/";
        ensureDirectories();
    }

    // Public API
    /**
     * Register a local uploaded file as a DuckDB namespace.
     *
     * @param fileName  original filename including extension (e.g. "sales data.csv")
     * @return          the sanitised namespace name that was registered
     * @throws DuckDbRegistrarException if the file type is unsupported or registration fails
     */
    public String registerFile(String fileName) {
        String ext = extension(fileName).toLowerCase(Locale.ROOT);
        String namespace = uniqueNamespace(sanitise(fileName));

        validateExtension(ext);

        // Sqlite files use their own JDBC driver, not Duckdb
        if (ext.equals("db") || ext.equals("sqlite")) {
            return registerSqlite(fileName, namespace);
        }

        String dbFile = DUCKDB_DIR + namespace + ".db";
        String srcFile = UPLOAD_DIR + fileName;

        // Build the DuckDB JDBC URL pointing to our per-namespace .db file
        String jdbcUrl = "jdbc:duckdb:" + dbFile;

        // Initialise the DuckDB database
        initialise(jdbcUrl, srcFile, namespace, ext);

        // Register with ConnectionRegistry as a standard namespace
        ConnectionConfig config = new ConnectionConfig(
                namespace, "duckdb", "localhost", 0,
                dbFile, "", "", 4
        );
        registry.registerEphemeral(config);

        log.info("[duckdb] registered file source '{}' as namespace '{}'", fileName, namespace);
        return namespace;
    }

    /**
     * Register a remote HTTP/HTTPS or S3 URL as a DuckDB namespace.
     *
     * @param url         the remote URL (https://... or s3://...)
     * @param namespace   desired namespace name (will be sanitised + uniquified)
     * @param s3Config    S3 credentials — null for HTTP sources or public S3
     * @return            the final namespace name registered
     */
    public String registerRemote(String url, String namespace, S3Config s3Config) {
        String sanitised = uniqueNamespace(sanitise(namespace));
        String dbFile = DUCKDB_DIR + sanitised + ".db";
        String jdbcUrl = "jdbc:duckdb:" + dbFile;
        String ext = inferRemoteExtension(url);

        initialiseRemote(jdbcUrl, url, sanitised, ext, s3Config);

        ConnectionConfig config = new ConnectionConfig(
                sanitised, "duckdb", "localhost", 0,
                dbFile, "", "", 4
        );
        registry.registerEphemeral(config);

        log.info("[duckdb] registered remote source '{}' as namespace '{}'", url, sanitised);
        return sanitised;
    }

    /**
     * Deregister a DuckDB namespace and delete its .db file.
     * The original source file is NOT deleted here — FileSourceHandler handles that.
     */
    public void deregister(String namespace) {
        registry.deregister(namespace);

        Path dbFile = Paths.get(DUCKDB_DIR + namespace + ".db");
        try {
            Files.deleteIfExists(dbFile);
            //DuckDB also creates a .db.wal file
            Files.deleteIfExists(Path.of(dbFile + ".wal"));
        } catch (IOException e) {
            log.warn("[duckdb] could not delete db file for namespace '{}': {}", namespace, e.getMessage());
        }

        log.info("[duckdb] deregistered namespace '{}'", namespace);
    }

    /**
     * Re-register all previously uploaded files on app restart.
     * Scans the uploads directory and re-creates any namespace whose
     * .db file already exists (meaning it was registered in a previous session).
     */
    public void rehydrate() {
        Path uploadsDir = Path.of(UPLOAD_DIR);
        if (!Files.exists(uploadsDir)) return;

        try {
            Files.list(uploadsDir).forEach(file -> {
                String filename = file.getFileName().toString();
                String namespace = sanitise(filename);
                Path dbFile = Path.of(DUCKDB_DIR + namespace + ".db");

                // only re-register if the DuckDB file already exists
                if (Files.exists(dbFile) && !registry.hasNamespace(namespace)) {
                    try {
                        String ext = extension(filename).toLowerCase(Locale.ROOT);
                        String jdbcUrl = "jdbc:duckdb:" + dbFile;

                        // For sqlite files use their own JDBC driver
                        if (ext.equals("db") || ext.equals("sqlite")) {
                            registerSqlite(filename, namespace);
                            return;
                        }

                        // Re-register with ConnectionRegistry
                        ConnectionConfig config = new ConnectionConfig(
                                namespace, "duckdb", "localhost", 0,
                                dbFile.toString(), "", "", 4
                        );
                        registry.registerEphemeral(config);
                        log.info("[duckdb] rehydrated namespace '{}'", namespace);
                    } catch (Exception e) {
                        log.warn("[duckdb] failed to rehydrate '{}': {}", filename, e.getMessage());
                    }
                }
            });
        } catch (IOException e) {
            log.warn("[duckdb] rehydrate scan failed: {}", e.getMessage());
        }
    }

    /**
     * Sanitise a filename or URL fragment into a valid namespace identifier.
     *
     * Examples:
     *   "sales data.csv"      → "sales_data_csv"
     *   "orders (2).parquet"  → "orders_2_parquet"
     *   "https://s3.amazonaws.com/my-bucket/data.json" → "data_json"
     *   "s3://my-bucket/folder/users.csv" → "users_csv"
     */
    public static String sanitise(String raw) {
        // For URLs take just the last path segment
        String name = raw;
        if (raw.contains("/")) {
            name = raw.substring(raw.lastIndexOf("/") + 1);
        }
        // Strip query String if present
        if (name.contains("?")) {
            name = name.substring(0, name.indexOf("?"));
        }
        // Replace dots
        name = name.replaceAll("[^a-zA-Z0-9]", "_")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "");

        // Namespace must start with a letter
        if (!name.isEmpty() && Character.isDigit(name.charAt(0))) {
            name = "src_" + name;
        }
        if (name.isEmpty()) {
            name = "source";
        }
        return name.toLowerCase(Locale.ROOT);
    }

    /**
     * Ensure the namespace is unique — appends _2, _3 etc. if collision exists.
     */
    public String uniqueNamespace(String base) {
        if (!registry.hasNamespace(base)) return base;
        int i = 2;
        while (registry.hasNamespace(base + "_" + i)) i++;
        return base + "_" + i;
    }

    // Private helpers

    /**
     * Initialise a DuckDB database for a local file source.
     * Creates a persistent view named after the namespace so the user can
     * write: SELECT * FROM sales_data_csv
     */
    private void initialise(String jdbcUrl, String srcFile, String namespace, String ext) {
        try (Connection conn = DriverManager.getConnection(jdbcUrl);
             Statement stmt = conn.createStatement()) {

            stmt.execute("INSTALL httpfs; LOAD httpfs;");
            if (EXCEL_EXTENSIONS.contains(ext)) {
                stmt.execute("INSTALL excel; LOAD excel;");
            }

            // Create a persistance view over the source file
            String readFn = readFunction(srcFile, ext);
            stmt.execute("CREATE OR REPLACE VIEW \"%s\" AS SELECT * FROM %s"
                    .formatted(namespace, readFn));

            log.debug("[duckdb] initialised '{}' with view '{}'", srcFile, namespace);
        } catch (Exception e) {
            throw new DuckDbRegistrarException(
                    "Failed to initialise DuckDB for file '%s': %s".formatted(srcFile, e.getMessage()), e
            );
        }
    }

    /**
     * Initialise a DuckDB database for a remote HTTP/S3 source.
     */
    private void initialiseRemote(String jdbcUrl, String url, String namespace, String ext, S3Config s3) {
        try (Connection conn = DriverManager.getConnection(jdbcUrl);
        Statement stmt = conn.createStatement()) {
            stmt.execute("INSTALL httpfs; LOAD httpfs;");

            if (s3 != null) {
                if (s3.endpoint() != null && !s3.endpoint().isBlank()) {
                    stmt.execute("SET s3_endpoint='%s';".formatted(s3.endpoint()));
                }
                if (s3.region() != null && !s3.region().isBlank()) {
                    stmt.execute("SET s3_region='%s';".formatted(s3.region()));
                }
                if (s3.accessKeyId() != null && !s3.accessKeyId().isBlank()) {
                    stmt.execute("SET s3_access_key_id='%s';".formatted(s3.accessKeyId()));
                    stmt.execute("SET s3_secret_access_key='%s';".formatted(s3.secretAccessKey()));
                }
                // Force path-style for MinIO and other non-AWS providers
                if (s3.endpoint() != null && !s3.endpoint().isBlank()) {
                    stmt.execute("SET s3_url_style='path';");
                }
            }

            // Create view over the remote URL
            String readFn = readFunction(url, ext);
            stmt.execute("CREATE OR REPLACE VIEW \"%s\" AS SELECT * FROM %s"
                    .formatted(namespace, readFn));

            log.debug("[duckdb] initialised remote '{}' as view '{}'", url, namespace);

        } catch (Exception e) {
            throw new DuckDbRegistrarException(
                    "Failed to initialise DuckDB for remote '%s': %s".formatted(url, e.getMessage()), e);
        }
    }

    /**
     * Returns the appropriate DuckDB read function call for a given file/URL and extension.
     *
     * DuckDB can often auto-detect format from extension, but being explicit
     * is more reliable and gives better error messages.
     */
    private String readFunction(String path, String ext) {
        // Always single-quote the path
        String q = "'" + path + "'";
        return switch (ext) {
            case "csv", "tsv"         -> "read_csv_auto(%s)".formatted(q);
            case "json", "ndjson"     -> "read_json_auto(%s)".formatted(q);
            case "parquet"            -> "read_parquet(%s)".formatted(q);
            case "arrow"              -> "read_arrow(%s)".formatted(q);
            case "xlsx", "xls"        -> "read_xlsx(%s)".formatted(q);
            // For unknown extensions fall back to DuckDB's auto-detection
            default                  -> "read_auto(%s)".formatted(q);
        };
    }

    /**
    * Register a SQLite file using the existing JDBC SQLite path in ConnectionRegistry.
    * SQLite has its own JDBC driver and doesn't go through DuckDB.
    */
    private String registerSqlite(String filename, String namespace) {
        String srcFile = UPLOAD_DIR + filename;
        ConnectionConfig config = new ConnectionConfig(
                namespace, "sqlite", "localhost", 0,
                srcFile, "", "", 4
        );
        registry.registerEphemeral(config);
        log.info("[duckdb] registered SQLite '{}' as namespace '{}'", filename, namespace);
        return namespace;
    }

    /**
     * Infer file extension from a remote URL for read function selection.
     * Falls back to "parquet" as the most common remote format.
     */
    private String inferRemoteExtension(String url) {
        // Strip query string
        String path = url.contains("?") ? url.substring(0, url.indexOf('?')) : url;
        int dot = path.lastIndexOf('.');
        if (dot < 0 || dot < path.lastIndexOf('/')) return "parquet";
        return path.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /**
     * Extract file extension from a filename.
     */
    private String extension(String filename) {
        int dot = filename.lastIndexOf('.');
        return dot < 0 ? "" : filename.substring(dot + 1);
    }

    /**
     * Validate that the uploaded file extension is supported.
     */
    private void validateExtension(String ext) {
        Set<String> all = Set.of(
                "csv", "tsv", "json", "ndjson", "parquet", "arrow",
                "xlsx", "xls", "db", "sqlite"
        );
        if (!all.contains(ext)) {
            throw new DuckDbRegistrarException(
                    "Unsupported file type: .%s. Supported: %s".formatted(ext, all));
        }
    }

    /**
     * Ensure required directories exist.
     */
    private void ensureDirectories() {
        try {
            Files.createDirectories(Path.of(DUCKDB_DIR));
            Files.createDirectories(Path.of(UPLOAD_DIR));
        } catch (IOException e) {
            throw new DuckDbRegistrarException("Failed to create data directories", e);
        }
    }

    // s3 config record
    /**
     * S3 credentials and endpoint configuration.
     * All fields are optional — null means use DuckDB/AWS defaults.
     *
     * @param endpoint      custom endpoint URL for non-AWS providers
     *                      (e.g. "https://account.r2.cloudflarestorage.com")
     *                      null = AWS S3 default
     * @param region        AWS region (e.g. "us-east-1")
     * @param accessKeyId   AWS access key ID
     * @param secretAccessKey AWS secret access key
     */
    public record S3Config(
            String endpoint,
            String region,
            String accessKeyId,
            String secretAccessKey
    ) {}

    public static class DuckDbRegistrarException extends RuntimeException {
        public DuckDbRegistrarException(String message) { super(message); }
        public DuckDbRegistrarException(String message, Throwable cause) { super(message, cause); }
    }
}
