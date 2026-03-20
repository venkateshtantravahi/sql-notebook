package io.sqlnotebook.server;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.time.Instant;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Workspace file browser  -  serves the directory the app was launched from.
 *
 * Routes (all under /workspace/*):
 *   GET  /workspace             -  list relevant files in workspace root
 *   GET  /workspace/read        -  read a .sqlnb file (?name=foo.sqlnb)
 *   POST /workspace             -  create a new blank .sqlnb file  (body: {name})
 *   POST /workspace/save        -  overwrite a file   (?name=foo.sqlnb, body: notebook JSON)
 *   POST /workspace/rename      -  rename a file       (body: {from, to})
 *   DELETE /workspace           -  delete a file       (?name=foo.sqlnb)
 *
 * Security: all file names are validated to stay inside the workspace root  - 
 * path separators and ".." sequences are rejected outright.
 *
 * Only files with extensions in VISIBLE_EXTENSIONS are listed; hidden files
 * (dot-prefixed) are always excluded.
 */
public class WorkspaceHandler extends HttpServlet {

    private static final Set<String> VISIBLE_EXTENSIONS = Set.of(
            ".sqlnb",
            ".csv", ".tsv",
            ".parquet",
            ".db", ".sqlite", ".sqlite3",
            ".json", ".ndjson",
            ".arrow",
            ".xlsx", ".xls"
    );

    private final Path root;
    private final ObjectMapper mapper = new ObjectMapper();

    /**
     * @param workspacePath The directory the application was launched from
     *                      ({@code System.getProperty("user.dir")}).
     */
    public WorkspaceHandler(String workspacePath) {
        this.root = Path.of(workspacePath).toAbsolutePath().normalize();
    }

    // Routing

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String sub = sub(req);
        if (sub.isEmpty()) {
            listWorkspace(req, resp);
        } else if (sub.equals("/read")) {
            readFile(req, resp);
        } else {
            sendError(resp, 404, "Unknown path: " + sub);
        }
    }

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String sub = sub(req);
        if (sub.isEmpty()) {
            createFile(req, resp);
        } else if (sub.equals("/save")) {
            saveFile(req, resp);
        } else if (sub.equals("/rename")) {
            renameFile(req, resp);
        } else {
            sendError(resp, 404, "Unknown path: " + sub);
        }
    }

    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        deleteFile(req, resp);
    }

    // Handlers

    /** GET /workspace[?dir=rel/path]  -  list relevant files and subdirectories. */
    private void listWorkspace(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String dirParam = req.getParameter("dir");
        Path target = blank(dirParam) ? root : resolveDir(dirParam);
        if (target == null) { sendError(resp, 403, "Access denied"); return; }

        java.io.File dir = target.toFile();
        java.io.File[] children = dir.listFiles();
        if (children == null) children = new java.io.File[0];

        // Dirs first, then .sqlnb, then other visible files
        Arrays.sort(children,
                Comparator.<java.io.File, Integer>comparing(f -> {
                    if (f.isDirectory()) return 0;
                    if (f.getName().toLowerCase().endsWith(".sqlnb")) return 1;
                    return 2;
                }).thenComparing(f -> f.getName().toLowerCase()));

        String relPath = root.relativize(target).toString();

        ArrayNode files = mapper.createArrayNode();
        for (java.io.File f : children) {
            if (f.getName().startsWith(".")) continue;

            if (f.isDirectory()) {
                ObjectNode entry = mapper.createObjectNode();
                entry.put("name", f.getName());
                entry.put("type", "dir");
                files.add(entry);
            } else if (f.isFile() && isVisible(f.getName())) {
                ObjectNode entry = mapper.createObjectNode();
                entry.put("name",       f.getName());
                entry.put("type",       "file");
                entry.put("size",       f.length());
                entry.put("modifiedAt", f.lastModified());
                files.add(entry);
            }
        }

        ObjectNode body = mapper.createObjectNode();
        body.put("path",    target.toString());
        body.put("relPath", relPath);
        body.set("files",   files);
        sendJson(resp, 200, mapper.writeValueAsString(body));
    }

    /** GET /workspace/read?name=foo.sqlnb[&dir=rel/path]  -  return file contents as JSON. */
    private void readFile(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String name = req.getParameter("name");
        if (blank(name)) { sendError(resp, 400, "Missing name"); return; }

        Path dir  = dirParam(req);
        if (dir == null) { sendError(resp, 403, "Access denied"); return; }
        Path file = resolveIn(dir, name);
        if (file == null)          { sendError(resp, 403, "Access denied");         return; }
        if (!Files.exists(file))   { sendError(resp, 404, "Not found: " + name);    return; }

        String content = Files.readString(file, StandardCharsets.UTF_8);
        try {
            mapper.readTree(content); // validate JSON
        } catch (Exception e) {
            sendError(resp, 422, "File is not valid JSON: " + name);
            return;
        }
        sendJson(resp, 200, content);
    }

    /** POST /workspace[?dir=rel/path]  -  create a new blank .sqlnb file. Body: { "name": "foo.sqlnb" } */
    private void createFile(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        ObjectNode body = parseBody(req);
        if (body == null) { sendError(resp, 400, "Invalid JSON body"); return; }

        String name = body.path("name").asText("").trim();
        if (blank(name)) { sendError(resp, 400, "Missing name"); return; }
        if (!name.endsWith(".sqlnb")) name += ".sqlnb";

        Path dir  = dirParam(req);
        if (dir == null) { sendError(resp, 403, "Access denied"); return; }
        Path file = resolveIn(dir, name);
        if (file == null)          { sendError(resp, 403, "Access denied");              return; }
        if (Files.exists(file))    { sendError(resp, 409, "Already exists: " + name);   return; }

        String title = name.replaceFirst("\\.sqlnb$", "")
                           .replace('-', ' ').replace('_', ' ');
        Files.writeString(file, blankNotebook(title), StandardCharsets.UTF_8);

        ObjectNode result = mapper.createObjectNode();
        result.put("name",  name);
        result.put("title", title);
        sendJson(resp, 201, mapper.writeValueAsString(result));
    }

    /** POST /workspace/save?name=foo.sqlnb[&dir=rel/path]  -  overwrite file with request body. */
    private void saveFile(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String name = req.getParameter("name");
        if (blank(name)) { sendError(resp, 400, "Missing name"); return; }

        Path dir  = dirParam(req);
        if (dir == null) { sendError(resp, 403, "Access denied"); return; }
        Path file = resolveIn(dir, name);
        if (file == null) { sendError(resp, 403, "Access denied"); return; }

        String content = req.getReader().lines().collect(Collectors.joining("\n"));
        try {
            mapper.readTree(content); // validate JSON
        } catch (Exception e) {
            sendError(resp, 422, "Body is not valid JSON");
            return;
        }

        Path tmp = file.resolveSibling(name + ".tmp");
        Files.writeString(tmp, content, StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        try {
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            Files.deleteIfExists(tmp);
            throw e;
        }

        ObjectNode result = mapper.createObjectNode();
        result.put("saved", true);
        result.put("name",  name);
        sendJson(resp, 200, mapper.writeValueAsString(result));
    }

    /**
     * POST /workspace/rename  -  rename a .sqlnb file within the same directory.
     * Body: { "from": "a.sqlnb", "to": "b.sqlnb", "dir": "rel/path" }
     */
    private void renameFile(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        ObjectNode body = parseBody(req);
        if (body == null) { sendError(resp, 400, "Invalid JSON body"); return; }

        String from   = body.path("from").asText("").trim();
        String to     = body.path("to").asText("").trim();
        String dirStr = body.path("dir").asText(null);
        if (blank(from) || blank(to)) { sendError(resp, 400, "Missing from/to"); return; }
        if (!to.endsWith(".sqlnb")) to += ".sqlnb";

        Path dir = blank(dirStr) ? root : resolveDir(dirStr);
        if (dir == null) { sendError(resp, 403, "Access denied"); return; }

        Path src = resolveIn(dir, from);
        Path dst = resolveIn(dir, to);
        if (src == null || dst == null) { sendError(resp, 403, "Access denied"); return; }
        if (!Files.exists(src))         { sendError(resp, 404, "Not found: " + from); return; }
        if (Files.exists(dst))          { sendError(resp, 409, "Already exists: " + to); return; }

        Files.move(src, dst);

        ObjectNode result = mapper.createObjectNode();
        result.put("from", from);
        result.put("to",   to);
        sendJson(resp, 200, mapper.writeValueAsString(result));
    }

    /** DELETE /workspace?name=foo.sqlnb[&dir=rel/path]  -  delete a file. */
    private void deleteFile(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String name = req.getParameter("name");
        if (blank(name)) { sendError(resp, 400, "Missing name"); return; }

        Path dir  = dirParam(req);
        if (dir == null) { sendError(resp, 403, "Access denied"); return; }
        Path file = resolveIn(dir, name);
        if (file == null)        { sendError(resp, 403, "Access denied");      return; }
        if (!Files.exists(file)) { sendError(resp, 404, "Not found: " + name); return; }

        Files.delete(file);
        resp.setStatus(204);
    }

    // Helpers

    /**
     * Resolves a relative directory path from root.
     * Each path component must be a plain name  -  no "..", no separators within a component.
     * Returns {@code null} if the path is unsafe or escapes the workspace root.
     */
    private Path resolveDir(String dir) {
        if (blank(dir)) return root;
        if (dir.indexOf('\0') >= 0) return null;
        String[] parts = dir.replace('\\', '/').split("/");
        Path target = root;
        for (String part : parts) {
            if (part.isEmpty() || part.equals(".") || part.equals("..")) return null;
            if (part.contains("\\")) return null;
            target = target.resolve(part);
        }
        target = target.normalize();
        return target.startsWith(root) ? target : null;
    }

    /**
     * Resolves a bare filename within {@code dir}.
     * The name must not contain path separators or "..".
     */
    private Path resolveIn(Path dir, String name) {
        if (name.contains("/") || name.contains("\\")
                || name.contains("..") || name.indexOf('\0') >= 0) {
            return null;
        }
        Path resolved = dir.resolve(name).normalize();
        return resolved.startsWith(root) ? resolved : null;
    }

    /** Extract the optional {@code ?dir=} query param and resolve it; returns root if absent. */
    private Path dirParam(HttpServletRequest req) {
        String d = req.getParameter("dir");
        return blank(d) ? root : resolveDir(d);
    }

    private static boolean isVisible(String name) {
        int dot = name.lastIndexOf('.');
        return dot >= 0 && VISIBLE_EXTENSIONS.contains(name.substring(dot).toLowerCase());
    }

    private static boolean blank(String s) { return s == null || s.isBlank(); }

    private String sub(HttpServletRequest req) {
        String p = req.getPathInfo();
        return (p == null || p.equals("/")) ? "" : p;
    }

    private ObjectNode parseBody(HttpServletRequest req) {
        try {
            return (ObjectNode) mapper.readTree(req.getReader());
        } catch (Exception e) {
            return null;
        }
    }

    /** Builds a minimal blank .sqlnb notebook with a markdown title cell + one empty SQL cell. */
    private String blankNotebook(String title) throws IOException {
        ObjectNode nb = mapper.createObjectNode();

        ObjectNode fmt = nb.putObject("format");
        fmt.put("type",  "sqlnotebook");
        fmt.put("major", 2);
        fmt.put("minor", 0);

        ObjectNode meta = nb.putObject("metadata");
        meta.put("id",               "nb_" + shortId());
        meta.put("title",            title);
        meta.put("description",      "");
        meta.put("created",          Instant.now().toString());
        meta.put("modified",         Instant.now().toString());
        meta.putArray("tags");
        meta.putNull("defaultNamespace");
        ObjectNode gen = meta.putObject("generator");
        gen.put("app",     "sql-notebook");
        gen.put("version", "0.5.0");

        ArrayNode cells = nb.putArray("cells");

        ObjectNode md = cells.addObject();
        md.put("id",   "c_" + shortId());
        md.put("type", "markdown");
        ArrayNode mdSrc = md.putArray("source");
        mdSrc.add("# " + title);
        md.putObject("metadata");

        ObjectNode sql = cells.addObject();
        sql.put("id",   "c_" + shortId());
        sql.put("type", "sql");
        sql.putArray("source");
        sql.putObject("metadata");

        return mapper.writerWithDefaultPrettyPrinter().writeValueAsString(nb);
    }

    private static String shortId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    private void sendJson(HttpServletResponse resp, int status, String json) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.getWriter().write(json);
    }

    private void sendError(HttpServletResponse resp, int status, String message) throws IOException {
        ObjectNode body = mapper.createObjectNode();
        body.put("error", message);
        sendJson(resp, status, mapper.writeValueAsString(body));
    }
}
