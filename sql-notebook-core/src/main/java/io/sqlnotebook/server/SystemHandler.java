package io.sqlnotebook.server;

import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;

/**
 * GET /system/info
 *
 * Returns basic server-side system info the frontend needs for UX hints.
 * Currently returns the home directory so the SQLite file path field can
 * be pre-filled with a sensible starting path instead of leaving the user
 * to type the full absolute path from scratch.
 *
 * Response: { "homeDir": "/Users/alice", "separator": "/" }
 */
public class SystemHandler extends HttpServlet {

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        ObjectNode body = mapper.createObjectNode();
        body.put("homeDir",   System.getProperty("user.home"));
        body.put("separator", System.getProperty("file.separator"));
        body.put("os",        System.getProperty("os.name"));

        resp.setStatus(200);
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.getWriter().write(mapper.writeValueAsString(body));
    }
}
