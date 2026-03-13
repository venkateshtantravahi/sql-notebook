package io.sqlnotebook.duckdb;

import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.util.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * Manages disk-backed DuckDB databases for pinned federated query results.
 *
 * When the user pins a federated result, this registry:
 *   1. Creates a DuckDB .db file at ~/.sqlnotebook/pinned/<namespace>.db
 *   2. Materialises the result rows into a typed DuckDB table
 *   3. Registers the file as a queryable namespace in ConnectionRegistry
 *
 * Disk-backed (not in-memory):
 *   Writing to disk means pinned datasets survive JVM restarts — on next startup
 *   rehydrate() re-registers every .db file it finds in the pinned directory.
 *   It also means RAM holds only the HikariCP pool metadata, not the data itself;
 *   DuckDB reads from disk with columnar compression at query time.
 *
 * Type inference:
 *   Column types are inferred from the first non-null Java value per column so
 *   numeric columns stay numeric (BIGINT / DOUBLE) and arithmetic queries work
 *   correctly on pinned datasets.
 *
 * Pool size:
 *   Pinned datasets use a pool of 2 — they are read-only by definition and
 *   DuckDB serialises writes internally, so 2 is sufficient for concurrent reads.
 */
public class PinnedViewRegistry {

    private static final Logger log = LoggerFactory.getLogger(PinnedViewRegistry.class);

    private static final String DEFAULT_PINNED_DIR =
            System.getProperty("user.home") + "/.sqlnotebook/pinned/";

    private final String pinnedDir;
    private final ConnectionRegistry registry;

    // Tracks which namespaces belong to this registry for unpin validation
    private final Set<String> pinnedNamespaces = ConcurrentHashMap.newKeySet();

    public PinnedViewRegistry(ConnectionRegistry registry) {
        this(registry, DEFAULT_PINNED_DIR);
    }

    public PinnedViewRegistry(ConnectionRegistry registry, String pinnedDir) {
        this.registry  = registry;
        this.pinnedDir = pinnedDir.endsWith("/") ? pinnedDir : pinnedDir + "/";
        ensureDirectory();
        rehydrate();
    }

    /**
     * Materialise a federated result set as a typed DuckDB table, persist it to disk,
     * and register it as a queryable namespace in ConnectionRegistry.
     *
     * @param name    user-chosen label — will be sanitised and prefixed with "pinned_"
     * @param columns column names from the federated result
     * @param rows    data rows (Java objects: Long, Double, Boolean, String, null)
     * @return the registered namespace name (e.g. "pinned_user_orders")
     * @throws PinException if materialisation or registration fails
     */
    public String pin(String name, List<String> columns, List<List<Object>> rows) {
        String namespace = uniqueNamespace(DuckDbRegistrar.sanitise(name));
        Path   dbFile    = safePath(namespace);
        String jdbcUrl   = "jdbc:duckdb:" + dbFile;

        materialise(jdbcUrl, namespace, columns, rows);

        ConnectionConfig config = new ConnectionConfig(
                namespace, "duckdb", "localhost", 0,
                dbFile.toString(), "", "", 2
        );
        registry.registerEphemeral(config);
        pinnedNamespaces.add(namespace);

        log.info("[pin] pinned '{}' → namespace '{}' ({} rows, {} cols)",
                name, namespace, rows.size(), columns.size());
        return namespace;
    }

    /**
     * Deregister a pinned namespace from ConnectionRegistry and delete its .db file.
     *
     * @param namespace the namespace name to remove (must be a pinned namespace)
     * @throws IllegalArgumentException if the namespace is not managed by this registry
     */
    public void unpin(String namespace) {
        if (!pinnedNamespaces.contains(namespace)) {
            throw new IllegalArgumentException("Not a pinned namespace: " + namespace);
        }
        registry.deregister(namespace);
        pinnedNamespaces.remove(namespace);

        Path dbFile = safePath(namespace);
        try {
            Files.deleteIfExists(dbFile);
            Files.deleteIfExists(Path.of(dbFile + ".wal"));
        } catch (IOException e) {
            log.warn("[pin] could not delete db file for '{}': {}", namespace, e.getMessage());
        }
        log.info("[pin] unpinned namespace '{}'", namespace);
    }

    /** Returns an unmodifiable snapshot of all currently pinned namespace names. */
    public Set<String> listPinned() {
        return Collections.unmodifiableSet(pinnedNamespaces);
    }

    /** Returns true if the given namespace was created by this registry. */
    public boolean isPinned(String namespace) {
        return pinnedNamespaces.contains(namespace);
    }

    // -------------------------------------------------------------------------
    // private
    // -------------------------------------------------------------------------

    /**
     * Re-register any .db files found in the pinned directory on startup.
     * Because pinned datasets are disk-backed, they survive JVM restarts automatically.
     */
    private void rehydrate() {
        Path dir = Path.of(pinnedDir);
        if (!Files.exists(dir)) return;

        try {
            Files.list(dir)
                    .filter(p -> p.toString().endsWith(".db"))
                    .forEach(dbFile -> {
                        String namespace = dbFile.getFileName().toString().replace(".db", "");
                        if (registry.hasNamespace(namespace)) return;

                        ConnectionConfig config = new ConnectionConfig(
                                namespace, "duckdb", "localhost", 0,
                                dbFile.toString(), "", "", 2
                        );
                        registry.registerEphemeral(config);
                        pinnedNamespaces.add(namespace);
                        log.info("[pin] rehydrated pinned namespace '{}'", namespace);
                    });
        } catch (IOException e) {
            log.warn("[pin] rehydrate scan failed: {}", e.getMessage());
        }
    }

    /**
     * Creates the DuckDB database file, infers column types, and batch-inserts all rows.
     * The table is named after the namespace so queries follow the same convention
     * as regular file-source namespaces: {@code SELECT * FROM pinned_user_orders}.
     */
    private void materialise(String jdbcUrl, String namespace,
                             List<String> columns, List<List<Object>> rows) {
        try (Connection conn = DriverManager.getConnection(jdbcUrl);
             Statement  stmt = conn.createStatement()) {

            // Build DDL with inferred types per column
            String colDefs = IntStream.range(0, columns.size())
                    .mapToObj(i -> "\"%s\" %s".formatted(columns.get(i), inferType(rows, i)))
                    .collect(Collectors.joining(", "));

            stmt.execute("CREATE TABLE \"%s\" (%s)".formatted(namespace, colDefs));
            // Alias view so federated SQL can use namespace.data like regular file sources
            stmt.execute("CREATE VIEW \"data\" AS SELECT * FROM \"%s\"".formatted(namespace));

            if (!rows.isEmpty()) {
                String placeholders = columns.stream()
                        .map(c -> "?")
                        .collect(Collectors.joining(", "));
                String insertSql = "INSERT INTO \"%s\" VALUES (%s)".formatted(namespace, placeholders);

                try (PreparedStatement ps = conn.prepareStatement(insertSql)) {
                    for (List<Object> row : rows) {
                        for (int i = 0; i < columns.size(); i++) {
                            // Pass the original Java object — DuckDB JDBC maps types natively
                            ps.setObject(i + 1, i < row.size() ? row.get(i) : null);
                        }
                        ps.addBatch();
                    }
                    ps.executeBatch();
                }
            }

            log.debug("[pin] materialised {} rows into table '{}'", rows.size(), namespace);

        } catch (SQLException e) {
            throw new PinException(
                    "Failed to materialise pinned dataset '%s': %s".formatted(namespace, e.getMessage()), e);
        }
    }

    /**
     * Infers a DuckDB column type by inspecting the first non-null Java value in
     * the column. Falls back to VARCHAR for unknown or all-null columns.
     */
    private String inferType(List<List<Object>> rows, int colIndex) {
        for (List<Object> row : rows) {
            if (colIndex >= row.size()) continue;
            Object val = row.get(colIndex);
            if (val == null) continue;
            if (val instanceof Boolean)                     return "BOOLEAN";
            if (val instanceof Integer || val instanceof Long) return "BIGINT";
            if (val instanceof Float   || val instanceof Double) return "DOUBLE";
            if (val instanceof java.math.BigDecimal bd)
                return bd.scale() == 0 ? "BIGINT" : "DOUBLE";
            return "VARCHAR";
        }
        return "VARCHAR";
    }

    private String uniqueNamespace(String base) {
        if (!registry.hasNamespace(base)) return base;
        int i = 2;
        while (registry.hasNamespace(base + "_" + i)) i++;
        return base + "_" + i;
    }

    private Path safePath(String namespace) {
        try {
            return FileUtils.resolveInBaseDir(Path.of(pinnedDir), namespace + ".db");
        } catch (SecurityException e) {
            throw new PinException(e.getMessage());
        }
    }

    private void ensureDirectory() {
        try {
            Files.createDirectories(Path.of(pinnedDir));
        } catch (IOException e) {
            throw new PinException("Failed to create pinned directory: " + e.getMessage(), e);
        }
    }

    public static class PinException extends RuntimeException {
        public PinException(String message) { super(message); }
        public PinException(String message, Throwable cause) { super(message, cause); }
    }
}
