package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistry;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.sql.Connection;
import java.sql.Statement;
import java.util.*;
import java.util.concurrent.*;

/**
 * GET /namespaces
 *
 * Returns an array of namespace health objects. Each entry pings the
 * connection with SELECT 1 and reports whether it is reachable and
 * how long it took.
 *
 * Response shape:
 * [
 *   { "name": "local_postgres", "healthy": true,  "latencyMs": 4   },
 *   { "name": "local_sqlite",   "healthy": false, "latencyMs": null, "error": "..." }
 * ]
 *
 * Pings run in parallel with a 3-second timeout per namespace so a
 * single unreachable database does not stall the entire response.
 */
public class NamespaceHandler extends HttpServlet {

    private static final int PING_TIMEOUT_MS = 3000;

    private static final int MAX_PING_THREADS = 20;

    private final ConnectionRegistry registry;
    private final ObjectMapper mapper = new ObjectMapper();
    /* Bounded pool  -  prevents unbounded thread growth when many namespaces are registered */
    private final ExecutorService executor = Executors.newFixedThreadPool(MAX_PING_THREADS);

    public NamespaceHandler(ConnectionRegistry registry) {
        this.registry = registry;
    }

    /**
     * Returns health status for all registered namespaces.
     * Pings each namespace in parallel with a per-namespace timeout so a single
     * unreachable database does not stall the entire response.
     *
     * <p>Query parameter {@code all=true} includes ephemeral (file/remote) sources.
     * Without it, only persistent connections are returned.
     */
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {

        boolean all = "true".equalsIgnoreCase(req.getParameter("all"));
        Set<String> namespaces = registry.getNamespaces().stream()
                .filter(ns -> all || !registry.isEphemeral(ns))
                .collect(java.util.stream.Collectors.toSet());

        // Ping all namespaces in parallel
        List<Future<Map<String, Object>>> futures = new ArrayList<>();
        for (String ns: namespaces) {
            futures.add(executor.submit(() -> ping(ns)));
        }

        List<Map<String, Object>> results = new ArrayList<>();
        for (Future<Map<String, Object>> future: futures) {
            try {
                results.add(future.get(PING_TIMEOUT_MS + 500L, TimeUnit.MILLISECONDS));
            } catch (TimeoutException e) {
                future.cancel(true);
            } catch (Exception e) {
                // they are captured in ping
            }
        }

        // Sort alphabetically for stable UI ordering
        results.sort((a, b) -> String.valueOf(a.get("name"))
                .compareToIgnoreCase(String.valueOf(b.get("name"))));

        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.setStatus(HttpServletResponse.SC_OK);
        mapper.writeValue(resp.getWriter(), results);
    }

    /**
     * Pings a single namespace by executing SELECT 1.
     * Returns a health map regardless of outcome  -  failures are captured
     * as healthy=false with an error message rather than thrown.
     */
    private Map<String, Object> ping(String namespace) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", namespace);

        long start = System.currentTimeMillis();
        try (Connection conn = registry.getConnection(namespace)){
            conn.setNetworkTimeout(executor, PING_TIMEOUT_MS);
            try (Statement stmt = conn.createStatement()) {
                stmt.setQueryTimeout(3);
                stmt.execute("SELECT 1");
            }
            long latency = System.currentTimeMillis() - start;
            result.put("healthy", true);
            result.put("latencyMs", latency);
        } catch (Exception e) {
            long latency = System.currentTimeMillis() - start;
            result.put("healthy", false);
            result.put("latencyMs", latency);
            // Strip verbose JDBC prefix from error message for clean UI display
            String msg = e.getMessage();
            if (msg != null && msg.length() > 120) msg = msg.substring(0, 120) + "...";
            result.put("error", msg != null ? msg : "Connection failed");
        }

        return result;
    }

}
