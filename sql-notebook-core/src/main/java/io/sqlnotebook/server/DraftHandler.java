package io.sqlnotebook.server;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.file.*;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Handles server-side draft persistence for the active notebook.
 * Mounted at /draft in HttpServer.
 *
 * GET  /draft  — read current draft from disk, returns 204 if none exists yet
 * POST /draft  — atomically write draft to disk, rotate backup ring
 *
 * Storage layout:
 *   ~/.sqlnotebook/drafts/current.sqlnb      ← always the latest draft
 *   ~/.sqlnotebook/backups/current_<ts>.sqlnb ← backup ring, max 20 kept
 *
 * Atomic write strategy:
 *   1. Write to current.sqlnb.tmp
 *   2. Move (atomic rename) tmp → current.sqlnb
 *   Either the old version exists or the new one does — never a corrupt half-write.
 *
 * What is persisted:
 *   - Cell queries, namespace selection, cell order, notebook title
 *   - Result sets are deliberately excluded — they are stale on reload and
 *     always reproducible by re-running the query.
 */
public class DraftHandler extends HttpServlet {

    private static final String DRAFT_DIR = ".sqlnotebook/drafts";
    private static final String BACKUP_DIR = ".sqlnotebook/backups";
    private static final String DRAFT_FILE = "current.sqlnb";
    private static final int MAX_BACKUPS = 20;

    private static final DateTimeFormatter BACKUP_TS =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss").withZone(ZoneOffset.UTC);

    private final Path draftPath;
    private final Path backupDir;
    private final ObjectMapper mapper;

    public DraftHandler() {
        Path home = Path.of(System.getProperty("user.home"));
        this.draftPath = home.resolve(DRAFT_DIR).resolve(DRAFT_FILE);
        this.backupDir = home.resolve(BACKUP_DIR);
        this.mapper = new ObjectMapper();
    }

    /**
     * GET /draft — returns the current draft as JSON, or 404 if none exists yet.
     * If the draft file is corrupt (invalid JSON), falls back to the latest backup.
     * Returns 204 only when no draft and no backup are available.
     */
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        if (!Files.exists(draftPath)) {
            // First launch — no draft yet, frontend starts a blank notebook
            resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
            return;
        }

        byte[] raw;
        try {
            raw = Files.readAllBytes(draftPath);
        } catch (IOException e) {
            // I/O failure reading draft — try backup before giving up
            serveFallback(resp);
            return;
        }

        try {
            mapper.readTree(raw); // validate JSON integrity
        } catch (Exception e) {
            // Draft JSON is corrupt — serve most recent backup instead
            serveFallback(resp);
            return;
        }

        resp.setStatus(HttpServletResponse.SC_OK);
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.getOutputStream().write(raw);
    }

    /**
     * POST /draft — receives the full notebook JSON, writes it atomically, and rotates the backup ring.
     * Requires a {@code version} field in the payload for future format migration.
     */
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String body = req.getReader().lines().collect(Collectors.joining());

        // validate the incoming JSON
        JsonNode node;
        try {
            node = mapper.readTree(body);
        } catch (Exception e) {
            sendError(resp, 400, "Invalid JSON: " + e.getMessage());
            return;
        }

        // Require at minimum a version field so we can detect format changes later
        if (!node.has("version")) {
            sendError(resp, 400, "Missing required field: version");
            return;
        }

        try {
            ensureDirectories();
            rotateBefore(); // backup current draft before overwriting
            atomicWrite(body); // write new draft atomically
            pruneBackups(); // keep only the last MAX_BACKUPS

            ObjectNode ok = mapper.createObjectNode();
            ok.put("saved", true);
            ok.put("savedAt", Instant.now().toString());

            resp.setStatus(HttpServletResponse.SC_OK);
            resp.setContentType("application/json");
            resp.setCharacterEncoding("UTF-8");
            resp.getWriter().write(mapper.writeValueAsString(ok));
        } catch (Exception e) {
            sendError(resp, 500, "Failed to save draft: " + e.getMessage());
        }
    }

    /**
     * Serves the latest backup file when the primary draft is unavailable or corrupt.
     * Returns 204 No Content if no backups exist.
     */
    private void serveFallback(HttpServletResponse resp) throws IOException {
        Path fallback = latestBackup();
        if (fallback != null) {
            byte[] raw = Files.readAllBytes(fallback);
            resp.setStatus(HttpServletResponse.SC_OK);
            resp.setContentType("application/json");
            resp.setCharacterEncoding("UTF-8");
            resp.getOutputStream().write(raw);
        } else {
            resp.setStatus(HttpServletResponse.SC_NO_CONTENT);
        }
    }

    /**
     * Ensures ~/.sqlnotebook/drafts/ and ~/.sqlnotebook/backups/ both exist.
     */
    private void ensureDirectories() throws IOException {
        Files.createDirectories(draftPath.getParent());
        Files.createDirectories(backupDir);
    }

    /**
     * Copies current draft to backups dir with a timestamp suffix before overwriting.
     * If no draft exists yet (first save) this is a no-op.
     */
    private void rotateBefore() throws IOException {
        if (!Files.exists(draftPath)) return;

        String ts = BACKUP_TS.format(Instant.now());
        Path backupTarget = backupDir.resolve("current_" + ts + ".sqlnb");
        Files.copy(draftPath, backupTarget, StandardCopyOption.REPLACE_EXISTING);
    }

    /**
     * Writes content to a .tmp file then atomically renames it to the real draft path.
     * Guarantees the draft is always either the old or new version — never corrupt.
     */
    private void atomicWrite(String content)  throws IOException {
        Path tmp = draftPath.resolveSibling(DRAFT_FILE + ".tmp");
        Files.writeString(tmp, content, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        Files.move(tmp, draftPath, StandardCopyOption.REPLACE_EXISTING,  StandardCopyOption.ATOMIC_MOVE);
    }

    /**
     * Deletes oldest backup files when the backup count exceeds MAX_BACKUPS.
     * Sort by filename (which is timestamp-based) so oldest sort first.
     */
    private void pruneBackups() throws IOException {
        if (!Files.exists(backupDir)) return;

        List<Path> backups = new ArrayList<>();
        try (DirectoryStream<Path> ds = Files.newDirectoryStream(backupDir, "current_*.sqlnb")) {
            ds.forEach(backups::add);
        }

        if (backups.size() <= MAX_BACKUPS) return;

        backups.sort(Comparator.comparing(p -> p.getFileName().toString()));

        int excess = backups.size() - MAX_BACKUPS;
        for (int i = 0; i < excess; i++) {
            Files.deleteIfExists(backups.get(i));
        }
    }

    /**
     * Returns the most recent backup file, or null if the backup dir is empty.
     * Used as a fallback when the current draft is corrupt.
     */
    private Path latestBackup() {
        if (!Files.exists(backupDir)) return null;

        try {
            List<Path> backups = new ArrayList<>();
            try (DirectoryStream<Path> ds = Files.newDirectoryStream(backupDir, "current_*.sqlnb")) {
                ds.forEach(backups::add);
            }
            if (backups.isEmpty()) return null;
            backups.sort(Comparator.comparing(p -> p.getFileName().toString()));
            return backups.get(backups.size() - 1);
        } catch (Exception e) {
            return null;
        }
    }

    private void sendError(HttpServletResponse resp, int status, String message) throws IOException {
        ObjectNode body = mapper.createObjectNode();
        body.put("error", message);
        resp.setStatus(status);
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.getWriter().write(mapper.writeValueAsString(body));
    }
}
