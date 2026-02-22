package io.sqlnotebook.server;

import io.sqlnotebook.executor.QueryExecutor;
import io.sqlnotebook.executor.QueryResult;
import jakarta.websocket.*;
import jakarta.websocket.server.ServerEndpoint;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.concurrent.Future;

@ServerEndpoint("/ws/query")
public class QueryWebsocket {

    private static QueryExecutor executor;
    private static final ObjectMapper mapper = new ObjectMapper();

    /**
     * Called by HttpServer during startup to inject the shared executor.
     * Jakarta WebSocket creates a new endpoint instance per connection,
     * so we use a static reference for shared dependencies.
     */
    public static void setExecutor(QueryExecutor queryExecutor) {
        executor = queryExecutor;
    }

    @OnOpen
    public void onOpen(Session session) {}

    @OnMessage
    public void onMessage(String message, Session session) {
        QueryRequest request;
        try {
            request = mapper.readValue(message, QueryRequest.class);
        } catch (Exception e) {
            sendMessage(session, QueryResponse.error("unknown", "Invalid message format: " + e.getMessage()));
            return;
        }

        String cellId = request.cellId() != null ? request.cellId() : "unknown";

        if (request.namespace() == null || request.namespace().isBlank()
            || request.sql() == null || request.sql().isBlank()) {
            sendMessage(session, QueryResponse.error(cellId, "'namespace' and 'sql' are required"));
            return;
        }

        // Immediately push "running" so the UI can show a spinner
        sendMessage(session, QueryResponse.running(cellId));

        // Submit query asynchronously - do not block Websocket message thread
        try {
            Future<QueryResult> future = executor.execute(request.namespace(), request.sql());

            // Run the wait in a separate thread so other messages can still be processed
            Thread.ofVirtual().start(() -> {
                try {
                    QueryResult result = future.get();
                    sendMessage(session, QueryResponse.done(cellId, result));
                } catch (Exception e) {
                    sendMessage(session, QueryResponse.error(cellId, "Execution failed: " + e.getMessage()));
                }
            });
        } catch (Exception e) {
            sendMessage(session, QueryResponse.error(cellId, "Faield to submit query: " + e.getMessage()));
        }
    }

    @OnClose
    public void onClose(Session session, CloseReason reason) {}

    @OnError
    public void onError(Session session, Throwable thr) {
        sendMessage(session, QueryResponse.error("unknown", "WebSocket error: " + thr.getMessage()));
    }

    private void sendMessage(Session session, QueryResponse response) {
        if (!session.isOpen()) return;
        try {
            String json = mapper.writeValueAsString(response);
            session.getBasicRemote().sendText(json);
        } catch (IOException e) {
            // Session may have closed between the isOpen check and sendText — ignore
        }
    }
}
