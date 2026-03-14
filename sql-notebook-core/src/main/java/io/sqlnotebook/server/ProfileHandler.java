package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistry;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.sql.Connection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Handles GET /profile/{namespace} and GET /profile/{namespace}/{table} requests.
 *
 * Returns per-column statistics computed by ProfilerService.
 * Results are cached in memory for the lifetime of the server session;
 * pass ?refresh=true to force a re-computation.
 *
 * Routes:
 *   GET /profile/{namespace}         — auto-discovers the table, then profiles it
 *   GET /profile/{namespace}/{table} — profiles the named table
 *
 * Response shape:
 * {
 *   "namespace": "myns",
 *   "table":     "data",
 *   "columns": [
 *     { "name":"id", "type":"BIGINT", "rowCount":50000, "nullCount":0,
 *       "nullPct":0.0, "approxDistinct":50000, "min":"1", "max":"50000",
 *       "mean":"25000.5", "std":"14433.7" }
 *   ]
 * }
 *
 * Cache invalidation: the cache entry for a namespace is dropped automatically
 * when the namespace is deregistered (see evict()).
 */
public class ProfileHandler extends HttpServlet {

    private static final Logger log = LoggerFactory.getLogger(ProfileHandler.class);

    private final ConnectionRegistry registry;
    private final ProfilerService     profiler = new ProfilerService();
    private final ObjectMapper        mapper   = new ObjectMapper();

    /** Cache key: "namespace::table" → column profiles */
    private final ConcurrentHashMap<String, List<ProfilerService.ColumnProfile>> cache =
            new ConcurrentHashMap<>();

    public ProfileHandler(ConnectionRegistry registry) {
        this.registry = registry;
    }

    /**
     * Drops all cached profiles for the given namespace.
     * Called by HttpServer (or ConnectionHandler) when a namespace is removed.
     */
    public void evict(String namespace) {
        cache.keySet().removeIf(k -> k.startsWith(namespace + "::"));
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {

        // pathInfo is either "/{namespace}" or "/{namespace}/{table}"
        String path = req.getPathInfo();
        if (path == null || path.equals("/")) {
            sendError(resp, 400, "namespace required — use /profile/{namespace} or /profile/{namespace}/{table}");
            return;
        }

        // Split "/{namespace}" or "/{namespace}/{table}"
        String[] parts = path.substring(1).split("/", 2);
        String namespace = parts[0];
        String tableParam = parts.length > 1 ? parts[1] : null;

        if (!registry.getNamespaces().contains(namespace)) {
            sendError(resp, 404, "unknown namespace: " + namespace);
            return;
        }

        boolean refresh = "true".equalsIgnoreCase(req.getParameter("refresh"));

        try {
            // Fast path: if the table is explicit and the result is cached, skip borrowing
            // a connection entirely. This prevents DuckDB pool exhaustion (pool size = 1)
            // when the browser sends duplicate or concurrent profile requests.
            if (tableParam != null && !tableParam.isBlank() && !refresh) {
                String cacheKey = namespace + "::" + tableParam;
                List<ProfilerService.ColumnProfile> cached = cache.get(cacheKey);
                if (cached != null) {
                    writeResult(resp, namespace, tableParam, cached);
                    return;
                }
            }

            // Slow path: borrow connection to discover the table (if needed) and profile it
            final String table;
            final List<ProfilerService.ColumnProfile> columns;

            try (Connection conn = registry.getConnection(namespace)) {
                table = (tableParam != null && !tableParam.isBlank())
                        ? tableParam
                        : profiler.discoverTable(conn);

                if (table == null) {
                    sendError(resp, 404, "no tables found in namespace: " + namespace);
                    return;
                }

                String cacheKey = namespace + "::" + table;
                if (refresh) cache.remove(cacheKey);

                // Only compute if absent — connection is still open here
                columns = cache.computeIfAbsent(cacheKey, k -> {
                    try {
                        return profiler.profile(conn, table);
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                });
            }

            writeResult(resp, namespace, table, columns);

        } catch (RuntimeException e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            log.error("[profiler] {}/{} → {}", namespace, tableParam, cause.getMessage(), cause);
            sendError(resp, 500, cause.getMessage());
        } catch (Exception e) {
            log.error("[profiler] {}/{} → {}", namespace, tableParam, e.getMessage(), e);
            sendError(resp, 500, e.getMessage());
        }
    }

    private void writeResult(HttpServletResponse resp, String namespace, String table,
                             List<ProfilerService.ColumnProfile> columns) throws IOException {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("namespace", namespace);
        result.put("table",     table);
        result.put("columns",   columns);
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.setStatus(200);
        mapper.writeValue(resp.getWriter(), result);
    }

    private void sendError(HttpServletResponse resp, int status, String message) throws IOException {
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.setStatus(status);
        resp.getWriter().write("{\"error\":\"" + message + "\"}");
    }
}
