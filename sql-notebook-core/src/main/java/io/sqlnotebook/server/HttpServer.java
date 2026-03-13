package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.duckdb.DuckDbRegistrar;
import io.sqlnotebook.duckdb.FileSourceRegistry;
import io.sqlnotebook.duckdb.PinnedViewRegistry;
import io.sqlnotebook.executor.QueryExecutor;
import io.sqlnotebook.federation.FederatedQueryExecutor;
import io.sqlnotebook.server.HealthHandler;
import org.eclipse.jetty.ee10.websocket.jakarta.server.config.JakartaWebSocketServletContainerInitializer;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.ee10.servlet.ServletContextHandler;
import org.eclipse.jetty.ee10.servlet.ServletHolder;
import org.eclipse.jetty.server.ServerConnector;

/**
 * Main HTTP server wrapper using Jetty.
 * Configures both traditional REST endpoints and modern WebSocket endpoints.
 *
 * Binds exclusively to 127.0.0.1 — never 0.0.0.0 — so the server is only
 * reachable from this machine.
 *
 * Routes:
 *   GET    /health              — readiness probe (200 when pools are warm)
 *   GET    /namespaces          — list active namespaces
 *   POST   /query               — one-shot SQL query
 *   GET    /schema/*            — schema introspection
 *   POST   /connections/add     — add persistent JDBC connection
 *   POST   /connections/test    — test connection without saving
 *   PUT    /connections/:ns     — edit existing connection
 *   DELETE /connections/:ns     — remove persistent connection
 *   GET    /draft               — load notebook draft
 *   POST   /draft               — save notebook draft
 *   POST   /sources/upload      — upload local file as DuckDB namespace
 *   POST   /sources/remote      — register HTTP/S3 URL as DuckDB namespace
 *   GET    /sources             — list all file/remote sources
 *   DELETE /sources/:namespace  — remove file/remote source
 *   POST   /pin                 — materialise federated result as pinned dataset
 *   GET    /pin                 — list pinned datasets
 *   DELETE /pin/:namespace      — unpin and delete dataset
 *   WS     /ws                  — query WebSocket
 */
public class HttpServer {

    private final Server server;

    /**
     * Configures the server with routes and shared dependencies.
     *
     * @param port     The port to listen on.
     * @param registry The registry to provide to the NamespaceHandler.
     * @param executor The executor to provide to the QueryHandler and WebSocket.
     * @param sourceRegistry File/remote source registry for the data source feature.
     */
    public HttpServer(int port, ConnectionRegistry registry, QueryExecutor executor,
                      FileSourceRegistry sourceRegistry, DuckDbRegistrar registrar,
                      PinnedViewRegistry pinnedRegistry, int readyPoolCount) {
        server = new Server();
        ServerConnector connector = new ServerConnector(server);
        connector.setHost("127.0.0.1");
        connector.setPort(port);
        server.addConnector(connector);
        QueryWebsocket.setExecutor(executor);
        QueryWebsocket.setFederatedExecutor(new FederatedQueryExecutor(registry));

        ServletContextHandler context = new ServletContextHandler();
        context.setContextPath("/");

        context.addServlet(new ServletHolder(new HealthHandler(readyPoolCount)), "/health");
        context.addServlet(new ServletHolder(new NamespaceHandler(registry)), "/namespaces");
        context.addServlet(new ServletHolder(new QueryHandler(executor)),     "/query");
        context.addServlet(new ServletHolder(new SchemaHandler(registry)),    "/schema/*");
        context.addServlet(new ServletHolder(new DraftHandler()), "/draft");
        context.addServlet(new ServletHolder(new SystemHandler()),            "/system/*");
        context.addServlet(new ServletHolder(new FileBrowserHandler()),         "/files/*");
        context.addServlet(new ServletHolder(new FileSourceHandler(sourceRegistry, registrar)), "/sources/*");
        context.addServlet(new ServletHolder(new PinHandler(pinnedRegistry)), "/pin/*");
        ServletHolder connectionHolder = new ServletHolder(new ConnectionHandler(registry));
        context.addServlet(connectionHolder, "/connections/*");

        JakartaWebSocketServletContainerInitializer.configure(context, (servletContext, wsContainer) -> {
            wsContainer.setDefaultMaxTextMessageBufferSize(65535);
            wsContainer.addEndpoint(QueryWebsocket.class);
        });

        server.setHandler(context);
    }

    public void start() throws Exception { server.start(); }
    public void stop()  throws Exception { server.stop();  }
    public void join()  throws InterruptedException { server.join(); }

    public int getPort() {
        return ((org.eclipse.jetty.server.ServerConnector) server.getConnectors()[0]).getLocalPort();
    }
}