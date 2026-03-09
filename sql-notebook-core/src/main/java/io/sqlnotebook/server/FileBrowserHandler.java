package io.sqlnotebook.server;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * GET /files/browse?path=/Users/alice/Documents
 *
 * Returns the contents of a directory so the frontend can render a
 * filesystem browser modal for SQLite file selection.
 *
 * Response:
 * {
 *   "path":   "/Users/alice/Documents",
 *   "parent": "/Users/alice",
 *   "entries": [
 *     { "name": "chinook.db", "type": "file", "size": 884736 },
 *     { "name": "projects",   "type": "dir"                  }
 *   ]
 * }
 *
 * Only .db / .sqlite / .sqlite3 files are included — directories are
 * always included so the user can navigate. Hidden files (dot-files)
 * are excluded.
 *
 * Security: path is resolved to its canonical form and must be an
 * absolute path on the local filesystem. No symlink traversal outside
 * the filesystem root is allowed.
 */
public class FileBrowserHandler extends HttpServlet {

    private static final Set<String> SQLITE_EXTENSIONS = Set.of(
            ".db", ".sqlite", ".sqlite3"
    );

    private final ObjectMapper mapper = new ObjectMapper();

    /**
     * Allowed root directories for the file browser.
     * The canonical path must start with one of these.
     * User home is always allowed; OS-specific mount points are added
     * so users can browse external drives and common data locations.
     */
    private static final List<File> ALLOWED_ROOTS = buildAllowedRoots();

    private static List<File> buildAllowedRoots() {
        File userHome = new File(System.getProperty("user.home"));
        String os = System.getProperty("os.name", "").toLowerCase();

        if (os.contains("mac")) {
            return List.of(userHome, new File("/Volumes"), new File("/tmp"));
        } else if (os.contains("win")) {
            // Allow all drive roots (C:\, D:\, etc.) — Windows users
            // commonly store databases on non-system drives
            File[] roots = File.listRoots();
            var list = new java.util.ArrayList<File>();
            list.add(userHome);
            if (roots != null) list.addAll(Arrays.asList(roots));
            return List.copyOf(list);
        } else {
            // Linux / other Unix
            return List.of(userHome, new File("/home"), new File("/tmp"),
                    new File("/mnt"), new File("/media"));
        }
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        String rawPath = req.getParameter("path");

        //default to home directory if no path given
        if (rawPath == null || rawPath.isBlank()) {
            rawPath = System.getProperty("user.home");
        }

        // Reject null bytes — a classic path traversal trick
        if (rawPath.indexOf('\0') >= 0) {
            sendError(resp, 400, "Invalid path");
            return;
        }

        File dir;
        try {
            dir = new File(rawPath).getCanonicalFile();
        } catch (IOException ex) {
            sendError(resp, 400, "Invalid Path: " + rawPath);
            return;
        }

        // Verify the canonical path falls under an allowed root
        if (!isUnderAllowedRoot(dir)) {
            sendError(resp, 403, "Access denied: path is outside allowed directories");
            return;
        }

        if (!dir.exists()) {
            sendError(resp, 400, "Path does not exist: " + dir.getPath());
            return;
        }

        if (!dir.isDirectory()) {
            sendError(resp, 400, "Path is not a directory: " + dir.getPath());
            return;
        }

        if (!dir.canRead()) {
            sendError(resp, 403, "Cannot read directory: " + dir.getPath());
            return;
        }

        File[] children = dir.listFiles();
        if (children == null) children = new File[0];

        // Sort: directories first, then files, both alphabetically
        Arrays.sort(children, Comparator.<File, Boolean>comparing(f -> !f.isDirectory())
                .thenComparing(f -> f.getName().toLowerCase()));

        ObjectNode body = mapper.createObjectNode();
        ArrayNode entries = mapper.createArrayNode();

        body.put("path", dir.getPath());
        String parent = dir.getParent();
        if (parent == null || !isUnderAllowedRoot(new File(parent))) {
            parent = dir.getPath(); // stay at current directory
        }
        body.put("parent", parent);
        for (File f :  children) {
            // skip hidden files
            if (f.getName().startsWith(".")) continue;

            if (f.isDirectory()) {
                ObjectNode entry = mapper.createObjectNode();
                entry.put("name", f.getName());
                entry.put("type", "dir");
                entries.add(entry);
            } else if (isSqliteFile(f.getName())) {
                ObjectNode entry = mapper.createObjectNode();
                entry.put("name", f.getName());
                entry.put("type", "file");
                entry.put("size", f.length());
                entries.add(entry);
            }
        }

        body.set("entries", entries);

        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.setStatus(200);
        resp.getWriter().write(mapper.writeValueAsString(body));
    }

    /**
     * Check that the given canonical file falls under one of the allowed roots.
     */
    private static boolean isUnderAllowedRoot(File canonicalFile) {
        String path = canonicalFile.getPath();
        for (File root : ALLOWED_ROOTS) {
            try {
                String rootPath = root.getCanonicalPath();
                if (path.equals(rootPath) || path.startsWith(rootPath + File.separator)) {
                    return true;
                }
            } catch (IOException e) {
                // If we can't resolve the root, skip it
            }
        }
        return false;
    }

    private boolean isSqliteFile(String fileName) {
        int dot = fileName.lastIndexOf('.');
        if (dot < 0) return false;
        return SQLITE_EXTENSIONS.contains(fileName.substring(dot).toLowerCase());
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
