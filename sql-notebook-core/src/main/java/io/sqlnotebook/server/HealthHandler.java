package io.sqlnotebook.server;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;

/**
 * GET /health
 *
 * Returns 200 once the server is ready to accept queries.
 * The frontend polls this endpoint with exponential backoff on startup
 * so it waits for the backend to finish initialising connection pools
 * before attempting draft restore or namespace fetches.
 *
 * Response: { "status": "ready", "pools": N, "startedAt": <epoch ms> }
 */
public class HealthHandler extends HttpServlet {

    private final int    poolCount;
    private final long   startedAt;
    private final ObjectMapper mapper = new ObjectMapper();

    public HealthHandler(int poolCount) {
        this.poolCount = poolCount;
        this.startedAt = System.currentTimeMillis();
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        ObjectNode body = mapper.createObjectNode();
        body.put("status",    "ready");
        body.put("pools",     poolCount);
        body.put("startedAt", startedAt);

        resp.setStatus(200);
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.getWriter().write(mapper.writeValueAsString(body));
    }
}
