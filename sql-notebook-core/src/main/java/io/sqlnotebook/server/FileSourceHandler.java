package io.sqlnotebook.server;

import io.sqlnotebook.duckdb.DuckDbRegistrar;
import io.sqlnotebook.duckdb.FileSourceRegistry;
import io.sqlnotebook.util.FileUtils;
import jakarta.servlet.MultipartConfigElement;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.Part;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * FileSourceHandler
 *
 * HTTP endpoints for the Universal Data Source feature.
 * Mounted at /sources/* in HttpServer.
 *
 * POST   /sources/upload       — multipart file upload → DuckDB namespace
 * POST   /sources/remote       — register HTTP/S3 URL  → DuckDB namespace
 * GET    /sources              — list all registered data sources
 * DELETE /sources/:namespace   — remove source + deregister namespace
 *
 * File size limits enforced at the servlet layer:
 *   CSV / TSV / JSON / NDJSON   1 GB
 *   Parquet / Arrow             2 GB
 *   Excel (XLSX / XLS)          500 MB
 *   SQLite (.db / .sqlite)      2 GB
 *
 * All limits are validated before writing to disk.
 */
public class FileSourceHandler extends HttpServlet {
    private static final Logger log = LoggerFactory.getLogger(FileSourceHandler.class);

    // Max total multipart request size — 2 GB (largest single-file limit)
    private static final long MAX_REQUEST_SIZE  = 2L * 1024 * 1024 * 1024;
    private static final long MAX_FILE_SIZE     = 2L * 1024 * 1024 * 1024;
    private static final int  FILE_SIZE_THRESHOLD = 1024 * 1024; // 1 MB — below this stays in memory

    // Per-extension size limits (bytes)
    private static final long MB  = 1024L * 1024;
    private static final long GB  = 1024L * MB;

    private static final java.util.Map<String, Long> SIZE_LIMITS = java.util.Map.of(
            "csv",     1 * GB,
            "tsv",     1 * GB,
            "json",    1 * GB,
            "ndjson",  1 * GB,
            "parquet",   2 * GB,
            "arrow",     2 * GB,
            "xlsx",    500 * MB,
            "xls",     500 * MB,
            "db",        2 * GB,
            "sqlite",    2 * GB
    );

    private static final Set<String> SUPPORTED_EXTENSIONS = SIZE_LIMITS.keySet();

    private final FileSourceRegistry sourceRegistry;
    private final DuckDbRegistrar registrar;
    private final ObjectMapper mapper;

    public FileSourceHandler(FileSourceRegistry sourceRegistry, DuckDbRegistrar registrar) {
        this.sourceRegistry = sourceRegistry;
        this.registrar = registrar;
        this.mapper         = new ObjectMapper();
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws IOException, ServletException {

        String path = req.getPathInfo(); // "/upload" or "/remote"

        if ("/upload".equals(path)) {
            handleUpload(req, resp);
        } else if ("/remote".equals(path)) {
            handleRemote(req, resp);
        } else {
            sendError(resp, 404, "Unknown endpoint. Use POST /sources/upload or POST /sources/remote");
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo(); // null or "/"

        if (path == null || path.equals("/") || path.isBlank()) {
            handleList(resp);
        } else {
            sendError(resp, 404, "Use GET /sources to list all sources");
        }
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String path = req.getPathInfo(); // "/:namespace"

        if (path == null || path.equals("/") || path.length() < 2) {
            sendError(resp, 400, "Namespace required: DELETE /sources/:namespace");
            return;
        }

        String namespace = path.substring(1); // strip leading "/"
        handleDelete(namespace, resp);
    }

    /**
     * POST /sources/upload
     *
     * Accepts a multipart/form-data request with a single "file" part.
     * Validates extension and size, saves to uploads/, registers DuckDB namespace.
     *
     * Request:  multipart/form-data  field name: "file"
     * Response: { namespace, filename, kind: "file" }
     */
    private void handleUpload(HttpServletRequest req, HttpServletResponse resp)
            throws IOException, ServletException {

        // Configure multipart handling — Jetty requires this on the request
        req.setAttribute("org.eclipse.jetty.multipartConfig",
                new MultipartConfigElement(
                        System.getProperty("java.io.tmpdir"),
                        MAX_FILE_SIZE,
                        MAX_REQUEST_SIZE,
                        FILE_SIZE_THRESHOLD
                ));

        Part filePart;
        try {
            filePart = req.getPart("file");
        } catch (Exception e) {
            sendError(resp, 400, "Expected multipart/form-data with a 'file' field");
            return;
        }

        if (filePart == null) {
            sendError(resp, 400, "No file uploaded — include a 'file' field in the form");
            return;
        }

        // Extract original filename
        String filename = sanitiseFilename(getSubmittedFilename(filePart));
        if (filename == null || filename.isBlank()) {
            sendError(resp, 400, "Could not determine filename from upload");
            return;
        }

        // Validate extension
        String ext = FileUtils.extension(filename);
        if (!SUPPORTED_EXTENSIONS.contains(ext)) {
            sendError(resp, 400,
                    "Unsupported file type: .%s — supported: %s"
                            .formatted(ext, String.join(", ", SUPPORTED_EXTENSIONS)));
            return;
        }

        // Validate size against per-extension limit
        long sizeLimit = SIZE_LIMITS.get(ext);
        long fileSize  = filePart.getSize();
        if (fileSize > sizeLimit) {
            sendError(resp, 413,
                    "File too large: %.1f MB — limit for .%s is %.0f MB"
                            .formatted(fileSize / (double) MB, ext, sizeLimit / (double) MB));
            return;
        }

        // Save to uploads directory
        Path dest = Path.of(registrar.UPLOAD_DIR + filename);
        try (InputStream in = filePart.getInputStream()) {
            Files.createDirectories(dest.getParent());
            Files.copy(in, dest, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            sendError(resp, 500, "Failed to save file: " + e.getMessage());
            return;
        }

        // Register with DuckDB
        String namespace;
        try {
            namespace = sourceRegistry.addFile(filename);
        } catch (DuckDbRegistrar.DuckDbRegistrarException e) {
            // Clean up the uploaded file if registration fails
            Files.deleteIfExists(dest);
            sendError(resp, 500, "Failed to register data source: " + e.getMessage());
            return;
        }

        log.info("[upload] saved '{}' ({} bytes) → namespace '{}'", filename, fileSize, namespace);

        ObjectNode body = mapper.createObjectNode();
        body.put("namespace", namespace);
        body.put("filename",  filename);
        body.put("kind",      "file");
        body.put("sizeBytes", fileSize);
        sendJson(resp, 201, body);
    }

    /**
     * POST /sources/remote
     *
     * Registers a remote HTTP/HTTPS or S3 URL as a DuckDB namespace.
     *
     * Request body:
     * {
     *   "url":             "s3://bucket/data.parquet",   // required
     *   "label":           "my_dataset",                 // optional — used as namespace base
     *   "s3Endpoint":      "https://...",                // optional — non-AWS providers
     *   "s3Region":        "us-east-1",                  // optional
     *   "s3AccessKeyId":   "AKIA...",                    // optional — public buckets don't need this
     *   "s3SecretAccessKey": "..."                       // optional
     * }
     *
     * Response: { namespace, url, kind: "remote" }
     */
    private void handleRemote(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        JsonNode body;
        try {
            body = mapper.readTree(req.getInputStream());
        } catch (Exception e) {
            sendError(resp, 400, "Invalid JSON body");
            return;
        }

        String url = body.path("url").asText(null);
        if (url == null || url.isBlank()) {
            sendError(resp, 400, "'url' is required");
            return;
        }

        // Validate URL scheme
        String lower = url.toLowerCase(Locale.ROOT);
        if (!lower.startsWith("http://") && !lower.startsWith("https://")
                && !lower.startsWith("s3://")) {
            sendError(resp, 400, "URL must start with http://, https://, or s3://");
            return;
        }

        String label          = body.path("label").asText(null);
        String s3Endpoint     = nullIfEmpty(body.path("s3Endpoint").asText(null));
        String s3Region       = nullIfEmpty(body.path("s3Region").asText(null));
        String s3AccessKeyId  = nullIfEmpty(body.path("s3AccessKeyId").asText(null));
        String s3SecretKey    = nullIfEmpty(body.path("s3SecretAccessKey").asText(null));

        DuckDbRegistrar.S3Config s3Config = (s3AccessKeyId != null)
                ? new DuckDbRegistrar.S3Config(s3Endpoint, s3Region, s3AccessKeyId, s3SecretKey)
                : null;

        String namespace;
        try {
            namespace = sourceRegistry.addRemote(url, label, s3Config);
        } catch (DuckDbRegistrar.DuckDbRegistrarException e) {
            sendError(resp, 500, "Failed to register remote source: " + e.getMessage());
            return;
        }

        log.info("[remote] registered '{}' → namespace '{}'", url, namespace);

        ObjectNode responseBody = mapper.createObjectNode();
        responseBody.put("namespace", namespace);
        responseBody.put("url",       url);
        responseBody.put("kind",      "remote");
        sendJson(resp, 201, responseBody);
    }

    /**
     * GET /sources
     *
     * Returns all registered data sources. S3 secrets are stripped from the response.
     *
     * Response: { sources: [ { kind, namespace, filename?, url?, addedAt, ... } ] }
     */
    private void handleList(HttpServletResponse resp) throws IOException {
        List<FileSourceRegistry.SourceEntry> entries = sourceRegistry.list();

        ObjectNode body = mapper.createObjectNode();
        ArrayNode arr  = body.putArray("sources");
        for (FileSourceRegistry.SourceEntry entry : entries) {
            arr.add(entry.toApiNode(mapper));
        }
        sendJson(resp, 200, body);
    }

    /**
     * DELETE /sources/:namespace
     *
     * Removes the source, deregisters the DuckDB namespace, and deletes the
     * uploaded file (for file sources).
     */
    private void handleDelete(String namespace, HttpServletResponse resp) throws IOException {
        try {
            sourceRegistry.remove(namespace);
        } catch (IllegalArgumentException e) {
            sendError(resp, 404, "Unknown source namespace: " + namespace);
            return;
        } catch (Exception e) {
            sendError(resp, 500, "Failed to remove source: " + e.getMessage());
            return;
        }

        ObjectNode body = mapper.createObjectNode();
        body.put("namespace", namespace);
        body.put("message",   "Source removed");
        sendJson(resp, 200, body);
    }

    /**
     * Extract the submitted filename from a multipart Part.
     * Jetty / servlet containers expose this differently — handle both.
     */
    private String getSubmittedFilename(Part part) {
        // Standard servlet 3.1+ approach
        String name = part.getSubmittedFileName();
        if (name != null && !name.isBlank()) return name;

        // Fallback: parse Content-Disposition header
        String cd = part.getHeader("Content-Disposition");
        if (cd == null) return null;
        for (String token : cd.split(";")) {
            token = token.trim();
            if (token.startsWith("filename=")) {
                return token.substring(9).replace("\"", "").trim();
            }
        }
        return null;
    }

    /**
     * Sanitise a filename — strip path separators and normalise to just the base name.
     * Prevents path traversal attacks.
     */
    private String sanitiseFilename(String raw) {
        if (raw == null) return null;
        // Strip any directory components — keep only the filename
        String name = Path.of(raw).getFileName().toString();
        // Remove characters that could cause issues on any OS
        return name.replaceAll("[^a-zA-Z0-9._\\- ]", "_");
    }

    private String nullIfEmpty(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private void sendJson(HttpServletResponse resp, int status, Object body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        mapper.writeValue(resp.getOutputStream(), body);
    }

    private void sendError(HttpServletResponse resp, int status, String message) throws IOException {
        ObjectNode body = mapper.createObjectNode();
        body.put("error", message);
        sendJson(resp, status, body);
    }
}
