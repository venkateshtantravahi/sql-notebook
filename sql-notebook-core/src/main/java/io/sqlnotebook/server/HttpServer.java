package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.executor.QueryExecutor;
import org.eclipse.jetty.ee10.websocket.jakarta.server.config.JakartaWebSocketServletContainerInitializer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.ee10.servlet.ServletContextHandler;
import org.eclipse.jetty.ee10.servlet.ServletHolder;

/**
 * Main HTTP server wrapper using Jetty.
 * Configures both traditional REST endpoints and modern WebSocket endpoints.
 */
public class HttpServer {

    private final Server server;

    /**
     * Configures the server with routes and shared dependencies.
     *
     * @param port     The port to listen on.
     * @param registry The registry to provide to the NamespaceHandler.
     * @param executor The executor to provide to the QueryHandler and WebSocket.
     */
    public HttpServer(int port, ConnectionRegistry registry, QueryExecutor executor) {
        server = new Server(port);
        // Inject the executor into the WebSocket static context
        QueryWebsocket.setExecutor(executor);

        ServletContextHandler context = new ServletContextHandler();
        context.setContextPath("/");
        // Register traditional HTTP Servlets
        context.addServlet(new ServletHolder(new NamespaceHandler(registry)), "/namespaces");
        context.addServlet(new ServletHolder(new QueryHandler(executor)), "/query");
        context.addServlet(new ServletHolder(new SchemaHandler(registry)),  "/schema/*");
        // Initialize Jakarta WebSocket support for Jetty
        JakartaWebSocketServletContainerInitializer.configure(context, (servletContext, wsContainer) -> {
            wsContainer.setDefaultMaxTextMessageBufferSize(65535);
            wsContainer.addEndpoint(QueryWebsocket.class);
        });

        server.setHandler(context);
    }

    public void start() throws Exception {
        server.start();
    }

    public void stop() throws Exception {
        server.stop();
    }

    public void join() throws InterruptedException {
        server.join();
    }

    /**
     * Returns the port the server is bound to (useful if port 0 was used for dynamic assignment).
     */
    public int getPort() {
        return ((org.eclipse.jetty.server.ServerConnector) server.getConnectors()[0]).getLocalPort();
    }
}
