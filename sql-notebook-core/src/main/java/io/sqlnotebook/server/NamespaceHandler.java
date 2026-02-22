package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistry;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.Set;

/**
 * Servlet that provides a list of all active database namespaces.
 * Useful for populating dropdown menus in the UI.
 */
public class NamespaceHandler extends HttpServlet {

    private final ConnectionRegistry registry;
    private final ObjectMapper mapper = new ObjectMapper();

    public NamespaceHandler(ConnectionRegistry registry) {
        this.registry = registry;
    }

    /**
     * Handles GET requests by returning a JSON array of namespace strings.
     */
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        Set<String> namespaces = registry.getNamespaces();
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.setStatus(HttpServletResponse.SC_OK);
        // Serialize the set of names directly to the response writer
        mapper.writeValue(resp.getWriter(), namespaces);
    }
}
