package io.sqlnotebook.server;

import io.sqlnotebook.executor.QueryExecutor;
import io.sqlnotebook.executor.QueryResult;
import io.sqlnotebook.federation.FederatedQueryExecutor;
import jakarta.websocket.*;
import jakarta.websocket.server.ServerEndpoint;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.concurrent.Future;

/**
 * WebSocket endpoint for handling real-time database queries.
 *
 * Routing:
 *   - {@code namespace} non-null/non-blank → single-namespace path via {@link QueryExecutor}
 *   - {@code namespace} null/blank         → federated path via {@link FederatedQueryExecutor};
 *     the executor scans the SQL for registered namespace prefixes and requires ≥ 2.
 *
 * Protocol — send:    {@code { cellId, namespace?, sql }}
 *           receive:  {@code { cellId, status: 'running' | 'done' | 'error', result?, error? }}
 */
@ServerEndpoint("/ws/query")
public class QueryWebsocket {

    /** Shared across all websocket instances (one instance per connection). */
    private static QueryExecutor executor;
    private static FederatedQueryExecutor federatedExecutor;
    private static final ObjectMapper mapper = new ObjectMapper();

    /** Called by HttpServer during startup to inject the shared executor. */
    public static void setExecutor(QueryExecutor queryExecutor) {
        executor = queryExecutor;
    }

    /** Called by HttpServer during startup to inject the federated executor. */
    public static void setFederatedExecutor(FederatedQueryExecutor fed) {
        federatedExecutor = fed;
    }

    @OnOpen
    public void onOpen(Session session) {
    }

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

        if (request.sql() == null || request.sql().isBlank()) {
            sendMessage(session, QueryResponse.error(cellId, "'sql' is required"));
            return;
        }

        boolean isFederated = request.namespace() == null || request.namespace().isBlank();

        // Push "running" immediately so the UI shows a spinner
        sendMessage(session, QueryResponse.running(cellId));

        if (isFederated) {
            try {
                Future<QueryResult> future = federatedExecutor.execute(request.sql());
                Thread.ofVirtual().start(() -> {
                    try {
                        QueryResult result = future.get();
                        sendMessage(session, QueryResponse.done(cellId, result));
                    } catch (Exception e) {
                        sendMessage(session, QueryResponse.error(cellId, "Federation failed: " + e.getMessage()));
                    }
                });
            } catch (Exception e) {
                sendMessage(session, QueryResponse.error(cellId, "Failed to submit federated query: " + e.getMessage()));
            }
        } else {
            try {
                Future<QueryResult> future = executor.execute(request.namespace(), request.sql());
                Thread.ofVirtual().start(() -> {
                    try {
                        QueryResult result = future.get();
                        sendMessage(session, QueryResponse.done(cellId, result));
                    } catch (Exception e) {
                        sendMessage(session, QueryResponse.error(cellId, "Execution failed: " + e.getMessage()));
                    }
                });
            } catch (Exception e) {
                sendMessage(session, QueryResponse.error(cellId, "Failed to submit query: " + e.getMessage()));
            }
        }
    }

    @OnClose
    public void onClose(Session session, CloseReason reason) {
    }

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
