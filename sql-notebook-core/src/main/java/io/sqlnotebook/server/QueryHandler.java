package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistryException;
import io.sqlnotebook.executor.QueryExecutor;
import io.sqlnotebook.executor.QueryResult;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Handles synchronous HTTP POST requests for SQL execution.
 * Mounted at /query in HttpServer. Intended for one-off programmatic access;
 * the primary interactive path uses {@link QueryWebsocket} for real-time feedback.
 *
 * <p>Request body: {@code { "namespace": "...", "sql": "..." }}
 * <p>Response: a {@link io.sqlnotebook.executor.QueryResult} JSON object on success,
 * or {@code { "error": "..." }} on failure.
 */
public class QueryHandler extends HttpServlet {

    private final QueryExecutor executor;
    private final ObjectMapper mapper = new ObjectMapper();

    public QueryHandler(QueryExecutor executor) {
        this.executor = executor;
    }

    /**
     * Executes a SQL query synchronously and writes the result as JSON.
     * Returns 400 for malformed input, 404 for unknown namespace, 500 for execution errors.
     */
    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        resp.setContentType("application/json");

        JsonNode body;
        try {
            // Read raw bytes and parse as JSON
            String rawBody = new String(req.getInputStream().readAllBytes());
            if (rawBody.isBlank()) {
                resp.setStatus(HttpServletResponse.SC_BAD_REQUEST);
                mapper.writeValue(resp.getWriter(), new ErrorResponse("Empty request body"));
                return;
            }
            body = mapper.readTree(rawBody);
        } catch (Exception ex) {
            resp.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            mapper.writeValue(resp.getWriter(), new ErrorResponse("Invalid request body"));
            return;
        }

        String namespace = body.has("namespace") ? body.get("namespace").asString() : null;
        String sql = body.has("sql") ? body.get("sql").asString() : null;

        if (namespace == null || namespace.isBlank() || sql == null || sql.isBlank()) {
            resp.setStatus(HttpServletResponse.SC_BAD_REQUEST);
            mapper.writeValue(resp.getWriter(), new ErrorResponse("Empty request body namespace and sql are required"));
            return;
        }

        try {
            // Submit and block until the result is ready (synchronous behavior for HTTP)
            Future<QueryResult> future = executor.execute(namespace, sql);
            QueryResult result = future.get();
            resp.setStatus(HttpServletResponse.SC_OK);
            mapper.writeValue(resp.getWriter(), result);
        } catch (ConnectionRegistryException e) {
            resp.setStatus(HttpServletResponse.SC_NOT_FOUND);
            mapper.writeValue(resp.getWriter(), new ErrorResponse("Unknown namespace: " + namespace));
        } catch (ExecutionException exc) {
            Throwable cause = exc.getCause();
            resp.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            mapper.writeValue(resp.getWriter(), new ErrorResponse("Execution failed: " + cause.getMessage()));
        } catch (Exception ex) {
            resp.setStatus(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
            mapper.writeValue(resp.getWriter(), new ErrorResponse("Execution failed: " + ex.getMessage()));
        }
    }

    record ErrorResponse(String error) {
    }
}
