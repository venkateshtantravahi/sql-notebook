package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistry;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.Set;

public class NamespaceHandler extends HttpServlet {

    private final ConnectionRegistry registry;
    private final ObjectMapper mapper = new ObjectMapper();

    public NamespaceHandler(ConnectionRegistry registry) {
        this.registry = registry;
    }

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        Set<String> namespaces = registry.getNamespaces();
        resp.setContentType("application/json");
        resp.setCharacterEncoding("UTF-8");
        resp.setStatus(HttpServletResponse.SC_OK);
        mapper.writeValue(resp.getWriter(), namespaces);
    }
}
