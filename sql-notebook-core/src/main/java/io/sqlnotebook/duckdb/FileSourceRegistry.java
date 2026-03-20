package io.sqlnotebook.duckdb;

import io.sqlnotebook.util.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * FileSourceRegistry
 *
 * Persists the list of registered file and remote data sources to:
 *   ~/.sqlnotebook/sources.json
 *
 * On every add/remove operation the file is atomically rewritten so a crash
 * mid-write never leaves a corrupt sources.json (same tmp -> rename strategy
 * used by DraftHandler).
 *
 * On app startup, Main calls rehydrate() which reads sources.json and
 * re-registers each entry with DuckDbRegistrar  -  restoring all namespaces
 * without requiring the user to re-upload anything.
 *
 * S3 credential storage:
 *   Credentials are stored in sources.json. This file lives at
 *   ~/.sqlnotebook/ which is user-home-only on all platforms.
 *   We do NOT encrypt at rest in v1  -  acceptable for a local-only desktop tool.
 *   A future improvement could derive a key from the machine UUID and encrypt
 *   the accessKeyId/secretAccessKey fields.
 *
 * sources.json schema:
 * {
 *   "version": "1",
 *   "sources": [
 *     {
 *       "kind":      "file" | "remote",
 *       "namespace": "sales_data_csv",
 *       "filename":  "sales data.csv",     // file sources only
 *       "url":       "s3://bucket/f.csv",  // remote sources only
 *       "s3Endpoint":      "...",          // remote S3 sources only, nullable
 *       "s3Region":        "...",
 *       "s3AccessKeyId":   "...",
 *       "s3SecretAccessKey": "...",
 *       "addedAt":   "2026-03-07T10:00:00Z"
 *     }
 *   ]
 * }
 */
public class FileSourceRegistry {
    private static final Logger log = LoggerFactory.getLogger(FileSourceRegistry.class);

    private static final Path DEFAULT_SOURCES_FILE = Path.of(
            System.getProperty("user.home") + "/.sqlnotebook/sources.json");

    private final Path SOURCES_FILE;

    private static final String VERSION = "1";

    private final DuckDbRegistrar registrar;
    private final ObjectMapper    mapper = new ObjectMapper();

    // In-memory list  -  source of truth at runtime, sources.json is the durable copy
    private final List<SourceEntry> entries = new ArrayList<>();

    public FileSourceRegistry(DuckDbRegistrar registrar) {
        this(registrar, DEFAULT_SOURCES_FILE);
    }

    public FileSourceRegistry(DuckDbRegistrar registrar, Path sourcesFile) {
        this.registrar    = registrar;
        this.SOURCES_FILE = sourcesFile;
        ensureParentDir();
    }

    /**
     * Register a local file source and persist it.
     * Called by FileSourceHandler after the file has been saved to uploads/.
     *
     * @param filename  original filename (e.g. "sales data.csv")
     * @return          the namespace name assigned
     */
    /**
     * Register a file source with a user-supplied namespace name.
     * Delegates to {@link DuckDbRegistrar#registerFile(String, String)}.
     * Throws {@link DuckDbRegistrar.NamespaceConflictException} if the name is taken.
     */
    public synchronized String addFile(String filename, String namespaceHint) {
        String namespace = registrar.registerFile(filename, namespaceHint);
        entries.add(new SourceEntry(
                "file", namespace, filename, null,
                null, null, null, null,
                Instant.now().toString()
        ));
        persist();
        log.info("[sources] added file source '{}' -> namespace '{}'", filename, namespace);
        return namespace;
    }

    public synchronized String addFile(String filename) {
        String namespace = registrar.registerFile(filename);

        entries.add(new SourceEntry(
                "file", namespace, filename, null,
                null, null, null, null,
                Instant.now().toString()
        ));
        persist();

        log.info("[sources] added file source '{}' -> namespace '{}'", filename, namespace);
        return namespace;
    }

    /**
     * Register a remote HTTP/S3 source and persist it.
     *
     * @param url        the remote URL
     * @param label      user-supplied label used as namespace base (can be null  -  URL is used)
     * @param s3Config   S3 credentials  -  null for HTTP sources
     * @return           the namespace name assigned
     */
    public synchronized String addRemote(String url, String label, DuckDbRegistrar.S3Config s3Config) {
        String base      = label != null && !label.isBlank() ? label : url;
        String namespace = registrar.registerRemote(url, base, s3Config);

        entries.add(new SourceEntry(
                "remote", namespace, null, url,
                s3Config != null ? s3Config.endpoint()         : null,
                s3Config != null ? s3Config.region()           : null,
                s3Config != null ? s3Config.accessKeyId()      : null,
                s3Config != null ? s3Config.secretAccessKey()  : null,
                Instant.now().toString()
        ));
        persist();

        log.info("[sources] added remote source '{}' -> namespace '{}'", url, namespace);
        return namespace;
    }

    /**
     * Remove a source by namespace  -  deregisters from DuckDB and removes from sources.json.
     * For file sources also deletes the uploaded file from disk.
     */
    public synchronized void remove(String namespace) {
        SourceEntry entry = entries.stream()
                .filter(e -> e.namespace().equals(namespace))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Unknown source namespace: " + namespace));

        // Delete uploaded file for file sources
        if ("file".equals(entry.kind()) && entry.filename() != null) {
            Path uploadedFile = resolveUploadPath(entry.filename());
            if (uploadedFile != null) {
                try {
                    Files.deleteIfExists(uploadedFile);
                    log.info("[sources] deleted uploaded file '{}'", uploadedFile);
                } catch (IOException e) {
                    log.warn("[sources] could not delete file '{}': {}", uploadedFile, e.getMessage());
                }
            }
        }

        registrar.deregister(namespace);
        entries.removeIf(e -> e.namespace().equals(namespace));
        persist();

        log.info("[sources] removed namespace '{}'", namespace);
    }

    /**
     * Return a snapshot of all registered sources for the GET /sources endpoint.
     */
    public synchronized List<SourceEntry> list() {
        return List.copyOf(entries);
    }

    /**
     * Re-register all sources from sources.json on app startup.
     * Called once from Main during initialisation.
     */
    public synchronized void rehydrate() throws IOException {
        if (!Files.exists(SOURCES_FILE)) {
            log.info("[sources] no sources.json found  -  fresh start");
            return;
        }

        try {
            JsonNode root = mapper.readTree(SOURCES_FILE.toFile());
            JsonNode sourcesNode = root.path("sources");

            if (!sourcesNode.isArray()) {
                log.warn("[sources] sources.json malformed  -  skipping rehydration");
                return;
            }

            for (JsonNode node : sourcesNode) {
                try {
                    rehydrateEntry(node);
                } catch (Exception e) {
                    log.warn("[sources] failed to rehydrate entry '{}': {}",
                            node.path("namespace").asString(), e.getMessage());
                }
            }

            log.info("[sources] rehydrated {} source(s)", entries.size());

        } catch (Exception e) {
            log.warn("[sources] failed to read sources.json: {}", e.getMessage());
        }
    }

    /**
     * Atomically write the current entries list to sources.json.
     * Uses tmp file -> rename so a crash never leaves a partial write.
     */
    private void persist() {
        try {
            ObjectNode root = mapper.createObjectNode();
            root.put("version", VERSION);

            ArrayNode sourcesNode = root.putArray("sources");
            for (SourceEntry e : entries) {
                ObjectNode node = sourcesNode.addObject();
                node.put("kind",      e.kind());
                node.put("namespace", e.namespace());
                node.put("addedAt",   e.addedAt());

                if (e.filename() != null) node.put("filename", e.filename());
                if (e.url()      != null) node.put("url",      e.url());

                // S3 fields  -  only written when non-null
                if (e.s3Endpoint()        != null) node.put("s3Endpoint",        e.s3Endpoint());
                if (e.s3Region()          != null) node.put("s3Region",          e.s3Region());
                if (e.s3AccessKeyId()     != null) node.put("s3AccessKeyId",     e.s3AccessKeyId());
                if (e.s3SecretAccessKey() != null) node.put("s3SecretAccessKey", e.s3SecretAccessKey());
            }

            // Atomic write: write to .tmp then rename
            Path tmp = SOURCES_FILE.resolveSibling("sources.json.tmp");
            mapper.writerWithDefaultPrettyPrinter().writeValue(tmp.toFile(), root);
            Files.move(tmp, SOURCES_FILE, StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING);

        } catch (IOException e) {
            log.error("[sources] failed to persist sources.json: {}", e.getMessage());
        }
    }

    /**
     * Re-register a single entry from sources.json.
     * Adds to in-memory list and re-registers with DuckDbRegistrar.
     */
    private void rehydrateEntry(JsonNode node) {
        String kind      = node.path("kind").asString();
        String namespace = node.path("namespace").asString();
        String addedAt   = node.path("addedAt").asString();

        if ("file".equals(kind)) {
            String filename = node.path("filename").asString();
            // Verify the upload file still exists
            Path uploadPath = resolveUploadPath(filename);
            if (uploadPath == null) {
                log.warn("[sources] path traversal blocked for filename '{}'  -  skipping", filename);
                return;
            }
            if (!Files.exists(uploadPath)) {
                log.warn("[sources] upload file '{}' no longer exists  -  skipping", filename);
                return;
            }
            // Re-register via registrar using the stored namespace so the correct
            // .db file is located regardless of whether the auto-generation logic
            // has changed since the original registration.
            registrar.registerFile(filename, namespace);
            entries.add(new SourceEntry(
                    "file", namespace, filename, null,
                    null, null, null, null, addedAt));

        } else if ("remote".equals(kind)) {
            String url              = node.path("url").asString();
            String s3Endpoint       = nullIfEmpty(node.path("s3Endpoint").asString(null));
            String s3Region         = nullIfEmpty(node.path("s3Region").asString(null));
            String s3AccessKeyId    = nullIfEmpty(node.path("s3AccessKeyId").asString(null));
            String s3SecretKey      = nullIfEmpty(node.path("s3SecretAccessKey").asString(null));

            DuckDbRegistrar.S3Config s3Config = (s3AccessKeyId != null)
                    ? new DuckDbRegistrar.S3Config(s3Endpoint, s3Region, s3AccessKeyId, s3SecretKey)
                    : null;

            registrar.registerRemote(url, namespace, s3Config);
            entries.add(new SourceEntry(
                    "remote", namespace, null, url,
                    s3Endpoint, s3Region, s3AccessKeyId, s3SecretKey, addedAt));
        }
    }

    /**
     * Ensures the parent directory of {@code SOURCES_FILE} exists.
     * Called once during construction so sources.json can always be written.
     */
    private void ensureParentDir() {
        try {
            Files.createDirectories(SOURCES_FILE.getParent());
        } catch (IOException e) {
            log.warn("[sources] could not create parent directory: {}", e.getMessage());
        }
    }

    /**
     * Resolves {@code filename} within the uploads directory and validates it does not
     * escape the base directory (path traversal guard).
     *
     * @param filename the raw filename from the registry entry
     * @return the resolved {@link Path}, or {@code null} if the path is unsafe
     */
    private Path resolveUploadPath(String filename) {
        try {
            return FileUtils.resolveInBaseDir(Path.of(registrar.UPLOAD_DIR), filename);
        } catch (SecurityException e) {
            return null;
        }
    }

    private String nullIfEmpty(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    /**
     * Immutable representation of a registered data source.
     * Serialised to/from sources.json and returned by GET /sources.
     */
    public record SourceEntry(
            String kind,              // "file" | "remote"
            String namespace,         // registered namespace name
            String filename,          // original filename  -  file sources only
            String url,               // remote URL  -  remote sources only
            String s3Endpoint,        // custom S3 endpoint  -  nullable
            String s3Region,          // AWS region  -  nullable
            String s3AccessKeyId,     // S3 access key  -  nullable
            String s3SecretAccessKey, // S3 secret  -  nullable
            String addedAt            // ISO-8601 timestamp
    ) {
        /** Safe view for API responses  -  strips S3 secret from serialisation */
        public ObjectNode toApiNode(ObjectMapper mapper) {
            ObjectNode node = mapper.createObjectNode();
            node.put("kind",      kind);
            node.put("namespace", namespace);
            node.put("addedAt",   addedAt);
            if (filename    != null) node.put("filename",    filename);
            if (url         != null) node.put("url",         url);
            if (s3Endpoint  != null) node.put("s3Endpoint",  s3Endpoint);
            if (s3Region    != null) node.put("s3Region",    s3Region);
            if (s3AccessKeyId != null) node.put("s3AccessKeyId", s3AccessKeyId);
            // s3SecretAccessKey intentionally omitted from API response
            return node;
        }
    }
}

