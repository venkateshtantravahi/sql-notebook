package io.sqlnotebook.server;

import io.sqlnotebook.duckdb.PinnedViewRegistry;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * HTTP handler for pinned dataset operations.
 * Mounted at /pin/* in HttpServer.
 *
 * POST   /pin         -  materialise a federated result as a named DuckDB dataset
 * GET    /pin         -  list all currently pinned namespace names
 * DELETE /pin/:ns     -  unpin (deregister + delete .db file)
 *
 * POST /pin request body:
 * {
 *   "name":    "user_orders",           // user-chosen label (will be sanitised)
 *   "columns": ["user_id", "total"],    // column names from the federated result
 *   "rows":    [[1, 342.5], [2, 178.0]] // data rows  -  numbers, strings, booleans, nulls
 * }
 *
 * POST /pin response:
 * { "namespace": "pinned_user_orders" }   // the registered namespace name
 */
public class PinHandler extends HttpServlet {

    private final PinnedViewRegistry pinnedRegistry;
    private final ObjectMapper mapper = new ObjectMapper();

    public PinHandler(PinnedViewRegistry pinnedRegistry) {
        this.pinnedRegistry = pinnedRegistry;
    }

    /** GET /pin  -  returns { "pinned": ["pinned_a", "pinned_b", ...] } */
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        ArrayNode arr = mapper.createArrayNode();
        pinnedRegistry.listPinned().forEach(arr::add);

        ObjectNode body = mapper.createObjectNode();
        body.set("pinned", arr);

        json(resp, 200, body);
    }

    /** POST /pin  -  materialise and register a new pinned dataset. */
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String raw;
        try {
            raw = req.getReader().lines().collect(Collectors.joining());
        } catch (Exception e) {
            error(resp, 400, "Could not read request body");
            return;
        }

        JsonNode node;
        try {
            node = mapper.readTree(raw);
        } catch (Exception e) {
            error(resp, 400, "Invalid JSON: " + e.getMessage());
            return;
        }

        if (!node.has("name") || !node.has("columns") || !node.has("rows")) {
            error(resp, 400, "Missing required fields: name, columns, rows");
            return;
        }

        String name = node.get("name").asText("").trim();
        if (name.isEmpty()) {
            error(resp, 400, "name must not be blank");
            return;
        }

        List<String> columns = new ArrayList<>();
        for (JsonNode col : node.get("columns")) {
            columns.add(col.asText());
        }
        if (columns.isEmpty()) {
            error(resp, 400, "columns must not be empty");
            return;
        }

        // Deserialise rows, preserving native JSON types so type inference works
        List<List<Object>> rows = new ArrayList<>();
        for (JsonNode rowNode : node.get("rows")) {
            List<Object> row = new ArrayList<>();
            for (JsonNode cell : rowNode) {
                if (cell.isNull())                 row.add(null);
                else if (cell.isBoolean())         row.add(cell.asBoolean());
                else if (cell.isIntegralNumber())   row.add(cell.asLong());
                else if (cell.isFloatingPointNumber()) row.add(cell.asDouble());
                else                               row.add(cell.asText());
            }
            rows.add(row);
        }

        try {
            String namespace = pinnedRegistry.pin(name, columns, rows);
            ObjectNode ok = mapper.createObjectNode();
            ok.put("namespace", namespace);
            json(resp, 201, ok);
        } catch (PinnedViewRegistry.PinException e) {
            error(resp, 500, e.getMessage());
        }
    }

    /**
     * DELETE /pin/:namespace  -  unpin the dataset.
     * The namespace name is the path segment after /pin/.
     */
    @Override
    protected void doDelete(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String pathInfo = req.getPathInfo(); // e.g. "/pinned_user_orders"
        if (pathInfo == null || pathInfo.equals("/")) {
            error(resp, 400, "Namespace required: DELETE /pin/:namespace");
            return;
        }
        String namespace = pathInfo.substring(1); // strip leading /

        try {
            pinnedRegistry.unpin(namespace);
            ObjectNode ok = mapper.createObjectNode();
            ok.put("unpinned", namespace);
            json(resp, 200, ok);
        } catch (IllegalArgumentException e) {
            error(resp, 404, e.getMessage());
        } catch (Exception e) {
            error(resp, 500, e.getMessage());
        }
    }

    private void json(HttpServletResponse resp, int status, ObjectNode body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.getWriter().write(mapper.writeValueAsString(body));
    }

    private void error(HttpServletResponse resp, int status, String message) throws IOException {
        ObjectNode body = mapper.createObjectNode();
        body.put("error", message);
        json(resp, status, body);
    }
}
