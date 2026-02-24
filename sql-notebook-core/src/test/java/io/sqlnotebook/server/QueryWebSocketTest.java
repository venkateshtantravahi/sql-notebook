package io.sqlnotebook.server;

import io.sqlnotebook.config.ConnectionConfig;
import io.sqlnotebook.connection.ConnectionRegistry;
import io.sqlnotebook.executor.QueryExecutor;
import jakarta.websocket.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
class QueryWebSocketTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:13");

    private HttpServer httpServer;
    private ConnectionRegistry registry;
    private QueryExecutor executor;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() throws Exception {
        ConnectionConfig config = new ConnectionConfig(
                "test", "postgresql",
                postgres.getHost(), postgres.getMappedPort(5432),
                postgres.getDatabaseName(), postgres.getUsername(), postgres.getPassword(), 5
        );
        registry   = new ConnectionRegistry(Map.of("test", config));
        executor   = new QueryExecutor(registry);
        httpServer = new HttpServer(0, registry, executor);
        httpServer.start();
    }

    @AfterEach
    void tearDown() throws Exception {
        executor.shutdown();
        registry.shutdown();
        httpServer.stop();
    }

    @Test
    void shouldReceiveRunningThenDoneForValidQuery() throws Exception {
        List<QueryResponse> responses = new ArrayList<>();
        CountDownLatch latch = new CountDownLatch(1);

        try (Session session = connectWebSocket(responses, latch, "done")) {
            QueryRequest request = new QueryRequest("cell-1", "test", "SELECT 1 AS val");
            session.getBasicRemote().sendText(mapper.writeValueAsString(request));
            assertTrue(latch.await(10, TimeUnit.SECONDS), "Did not receive response within timeout");
        }

        assertEquals(2, responses.size());
        assertEquals("running", responses.get(0).status());
        assertEquals("cell-1",  responses.get(0).cellId());
        assertEquals("done",    responses.get(1).status());
        assertEquals("cell-1",  responses.get(1).cellId());
        assertNotNull(responses.get(1).result());
        assertTrue(responses.get(1).result().success());
    }

    @Test
    void shouldReceiveRunningThenErrorForInvalidQuery() throws Exception {
        List<QueryResponse> responses = new ArrayList<>();
        CountDownLatch latch = new CountDownLatch(1);

        try (Session session = connectWebSocket(responses, latch, "done")) {
            QueryRequest request = new QueryRequest("cell-2", "test", "SELECT * FROM nonexistent_table_xyz");
            session.getBasicRemote().sendText(mapper.writeValueAsString(request));
            assertTrue(latch.await(10, TimeUnit.SECONDS));
        }

        assertEquals(2, responses.size());
        assertEquals("running", responses.get(0).status());
        assertEquals("done",    responses.get(1).status());
        assertFalse(responses.get(1).result().success());
        assertNotNull(responses.get(1).result().errorMessage());
    }

    @Test
    void shouldReturnErrorForUnknownNamespace() throws Exception {
        List<QueryResponse> responses = new ArrayList<>();
        CountDownLatch latch = new CountDownLatch(1);

        try (Session session = connectWebSocket(responses, latch, "error")) {
            QueryRequest request = new QueryRequest("cell-3", "unknown_ns", "SELECT 1");
            session.getBasicRemote().sendText(mapper.writeValueAsString(request));
            assertTrue(latch.await(10, TimeUnit.SECONDS));
        }

        assertTrue(responses.stream().anyMatch(r -> "error".equals(r.status())));
    }

    @Test
    void shouldHandleMissingFieldsWithError() throws Exception {
        List<QueryResponse> responses = new ArrayList<>();
        CountDownLatch latch = new CountDownLatch(1);

        try (Session session = connectWebSocket(responses, latch, "error")) {
            session.getBasicRemote().sendText("{\"cellId\":\"cell-4\",\"namespace\":\"test\"}");
            assertTrue(latch.await(5, TimeUnit.SECONDS));
        }

        assertEquals(1, responses.size());
        assertEquals("error",  responses.get(0).status());
        assertEquals("cell-4", responses.get(0).cellId());
    }

    @Test
    void shouldHandleTwoParallelCellsOnSameConnection() throws Exception {
        List<QueryResponse> responses = new ArrayList<>();
        CountDownLatch latch = new CountDownLatch(2);

        try (Session session = connectWebSocket(responses, latch, "done")) {
            session.getBasicRemote().sendText(mapper.writeValueAsString(
                    new QueryRequest("cell-A", "test", "SELECT 1 AS a")));
            session.getBasicRemote().sendText(mapper.writeValueAsString(
                    new QueryRequest("cell-B", "test", "SELECT 2 AS b")));
            assertTrue(latch.await(15, TimeUnit.SECONDS), "Both cells did not complete in time");
        }

        long doneCount = responses.stream().filter(r -> "done".equals(r.status())).count();
        assertEquals(2, doneCount);
        assertTrue(responses.stream().anyMatch(r -> "cell-A".equals(r.cellId()) && "done".equals(r.status())));
        assertTrue(responses.stream().anyMatch(r -> "cell-B".equals(r.cellId()) && "done".equals(r.status())));
    }

    // helper

    private Session connectWebSocket(List<QueryResponse> collected,
                                     CountDownLatch latch,
                                     String terminatingStatus) throws Exception {
        WebSocketContainer container = ContainerProvider.getWebSocketContainer();
        URI uri = new URI("ws://localhost:" + httpServer.getPort() + "/ws/query");

        Endpoint endpoint = new Endpoint() {
            @Override
            public void onOpen(Session session, EndpointConfig config) {
                session.addMessageHandler(String.class, message -> {
                    try {
                        QueryResponse response = mapper.readValue(message, QueryResponse.class);
                        collected.add(response);
                        if (terminatingStatus.equals(response.status())) {
                            latch.countDown();
                        }
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }
                });
            }
        };

        return container.connectToServer(endpoint, ClientEndpointConfig.Builder.create().build(), uri);
    }
}
