package io.sqlnotebook.server;

import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.executor.QueryExecutor;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.ee10.servlet.ServletContextHandler;
import org.eclipse.jetty.ee10.servlet.ServletHolder;

public class HttpServer {

    private final Server server;

    public HttpServer(int port, ConnectionRegistry registry, QueryExecutor executor) {
        server = new Server(port);

        ServletContextHandler context = new ServletContextHandler();
        context.setContextPath("/");

        context.addServlet(new ServletHolder(new NamespaceHandler(registry)), "/namespaces");
        context.addServlet(new ServletHolder(new QueryHandler(executor)), "/query");

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
}
