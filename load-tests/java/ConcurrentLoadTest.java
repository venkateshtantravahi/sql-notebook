///usr/bin/env java --source 21 "$0" "$@"; exit $?
/**
 * sql-notebook - Notebook Run-All Load Test
 *
 * Models the actual single-user usage pattern: a user clicks "Run All" on a
 * notebook and all SQL cells fire their WebSocket queries simultaneously.
 * There are no virtual users - each "cell" maps to one concurrent query,
 * exactly as the frontend sends them.
 *
 * Usage:
 *   java --source 21 load-tests/java/ConcurrentLoadTest.java
 *   java --source 21 load-tests/java/ConcurrentLoadTest.java --namespace chinook
 *   java --source 21 load-tests/java/ConcurrentLoadTest.java --url http://localhost:8080 --namespace employees
 *
 * Requirements:
 *   - sql-notebook server running on localhost:8080
 *   - A registered namespace (default: 'employees')
 *   - Java 21+
 *
 * What it tests:
 *   1. Run-All burst  -  12 cells firing simultaneously, measures time-to-first
 *      and time-to-last completion, per-cell latency distribution
 *   2. Pool contention  -  8 cells all against the same namespace whose pool
 *      size is 4, verifying the extra 4 queue and complete without deadlock
 *   3. REST responsiveness during active query  -  fires /health and /namespaces
 *      while a query is in-flight, verifies the REST layer stays fast
 */

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

public class ConcurrentLoadTest {

    static String BASE_URL  = "http://localhost:8080";
    static String WS_URL    = "ws://localhost:8080/ws/query";
    static String NAMESPACE = "employees";

    record Cell(String id, String namespace, String sql) {}

    static final ConcurrentLinkedQueue<Long> cellLatencies = new ConcurrentLinkedQueue<>();
    static final AtomicLong successCount = new AtomicLong();
    static final AtomicLong errorCount   = new AtomicLong();
    static final AtomicLong timeoutCount = new AtomicLong();

    // ---------------------------------------------------------------------------
    // Entry point
    // ---------------------------------------------------------------------------

    public static void main(String[] args) throws Exception {
        parseArgs(args);
        printBanner();

        if (!serverReachable()) {
            System.err.println("ERROR: cannot reach " + BASE_URL + "/health  -  is the server running?");
            System.exit(1);
        }

        System.out.println("\n[1/3] Notebook Run-All  -  12 cells fire simultaneously");
        runNotebook(buildNotebook(NAMESPACE));

        System.out.println("\n[2/3] Pool Contention  -  8 cells vs pool size 4 on same namespace");
        runPoolContention(NAMESPACE);

        System.out.println("\n[3/3] REST Responsiveness During Active Query");
        runRestDuringQuery(NAMESPACE);

        printSummary();
    }

    // ---------------------------------------------------------------------------
    // Scenario 1 - Notebook Run-All
    //
    // Simulates the user clicking Run All on a 12-cell notebook.  All cells
    // fire at the same instant via virtual threads (same as the frontend sending
    // N WebSocket messages in a tight loop).  Measures:
    //   - Whether all cells complete successfully
    //   - Total wall time (time from first send to last result)
    //   - Per-cell latency distribution (p50 / p95 / max)
    // ---------------------------------------------------------------------------

    static List<Cell> buildNotebook(String ns) {
        // Realistic mix of queries a user might have in an analytical notebook
        return List.of(
            new Cell("cell-01", ns, "SELECT * FROM " + ns + " LIMIT 50"),
            new Cell("cell-02", ns, "SELECT COUNT(*) AS total FROM " + ns),
            new Cell("cell-03", ns, "SELECT * FROM " + ns + " LIMIT 100"),
            new Cell("cell-04", ns, "SELECT * FROM " + ns + " ORDER BY 1 DESC LIMIT 25"),
            new Cell("cell-05", ns, "SELECT * FROM " + ns + " LIMIT 200"),
            new Cell("cell-06", ns, "SELECT COUNT(*) FROM " + ns + " WHERE 1=1"),
            new Cell("cell-07", ns, "SELECT * FROM " + ns + " LIMIT 10"),
            new Cell("cell-08", ns, "SELECT * FROM " + ns + " LIMIT 75"),
            new Cell("cell-09", ns, "SELECT * FROM " + ns + " ORDER BY 1 ASC LIMIT 30"),
            new Cell("cell-10", ns, "SELECT COUNT(*) FROM " + ns),
            new Cell("cell-11", ns, "SELECT * FROM " + ns + " LIMIT 150"),
            new Cell("cell-12", ns, "SELECT * FROM " + ns + " LIMIT 20")
        );
    }

    static void runNotebook(List<Cell> cells) throws Exception {
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

        var latch    = new CountDownLatch(cells.size());
        var executor = Executors.newVirtualThreadPerTaskExecutor();
        long successBefore = successCount.get();
        long errorBefore   = errorCount.get();

        Instant wallStart = Instant.now();

        for (Cell cell : cells) {
            executor.submit(() -> {
                sendWsQuery(client, cell.id(), cell.namespace(), cell.sql());
                latch.countDown();
            });
        }

        boolean allDone = latch.await(30, TimeUnit.SECONDS);
        executor.shutdownNow();
        long wallMs    = Duration.between(wallStart, Instant.now()).toMillis();
        long succeeded = successCount.get() - successBefore;
        long failed    = errorCount.get()   - errorBefore;

        print("  Cells fired : " + cells.size());
        print("  Succeeded   : " + succeeded + "  |  Failed: " + failed);
        print("  Wall time   : " + wallMs + "ms  (first send -> last result)");
        if (!allDone) print("  WARNING: not all cells completed within 30s");

        long[] arr = recentLatencies(cells.size());
        if (arr.length > 0) {
            Arrays.sort(arr);
            print(String.format("  Cell latency: p50=%dms  p95=%dms  max=%dms",
                percentile(arr, 50), percentile(arr, 95), arr[arr.length - 1]));
        }
        if (failed == 0) print("  PASS - all cells completed successfully");
        else             print("  FAIL - " + failed + " cell(s) did not complete");
    }

    // ---------------------------------------------------------------------------
    // Scenario 2 - Pool Contention
    //
    // Fires 8 cells all against the same namespace simultaneously.
    // The HikariCP pool size for DuckDB namespaces is 4, so 4 queries run
    // immediately and the other 4 must queue for a free connection.
    // This verifies:
    //   - No deadlock under pool saturation
    //   - All queued cells eventually complete (pool timeout not hit for a
    //     short queue wait)
    //   - The wall time is roughly 2x a single cell (two rounds through the pool)
    // ---------------------------------------------------------------------------

    static void runPoolContention(String ns) throws Exception {
        int cellCount = 8; // pool size 4, so second batch of 4 must queue
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

        var latch    = new CountDownLatch(cellCount);
        var executor = Executors.newVirtualThreadPerTaskExecutor();
        long successBefore = successCount.get();
        long errorBefore   = errorCount.get();
        Instant wallStart  = Instant.now();

        for (int i = 0; i < cellCount; i++) {
            final String cellId = "pool-cell-" + i;
            final String sql    = "SELECT COUNT(*) FROM " + ns;
            executor.submit(() -> {
                sendWsQuery(client, cellId, ns, sql);
                latch.countDown();
            });
        }

        boolean allDone = latch.await(30, TimeUnit.SECONDS);
        executor.shutdownNow();
        long wallMs    = Duration.between(wallStart, Instant.now()).toMillis();
        long succeeded = successCount.get() - successBefore;
        long failed    = errorCount.get()   - errorBefore;

        print("  " + cellCount + " cells fired against pool of 4:");
        print("  Succeeded: " + succeeded + "  |  Failed/timeout: " + failed);
        print("  Wall time: " + wallMs + "ms");
        if (!allDone)   print("  WARNING: cells did not all complete  -  possible deadlock or pool timeout");
        if (failed == 0) print("  PASS - queued cells completed without error");
        else             print("  NOTE - " + failed + " failure(s)  -  check pool connectionTimeout setting");
    }

    // ---------------------------------------------------------------------------
    // Scenario 3 - REST Responsiveness During Active Query
    //
    // The sidebar polls /namespaces every 30s and the schema explorer fires
    // /schema/:ns on demand.  This scenario fires a background query (like
    // a slow aggregation the user kicked off) and measures /health and
    // /namespaces latency while that query is in-flight.
    //
    // The REST layer must stay fast regardless of what the query engine is doing.
    // A slow REST response here would freeze the schema explorer or sidebar.
    // ---------------------------------------------------------------------------

    static void runRestDuringQuery(String ns) throws Exception {
        HttpClient client = HttpClient.newBuilder().build();
        int restCalls = 20;

        // Fire a background query that will keep a pool connection busy
        var executor = Executors.newVirtualThreadPerTaskExecutor();
        executor.submit(() ->
            sendWsQuery(client, "bg-query", ns, "SELECT * FROM " + ns + " LIMIT 1000"));

        // Small pause so the query gets in-flight before we start REST probes
        Thread.sleep(50);

        long[] healthTimes = new long[restCalls];
        long[] nsTimes     = new long[restCalls];

        for (int i = 0; i < restCalls; i++) {
            healthTimes[i] = measureGet(client, BASE_URL + "/health");
            nsTimes[i]     = measureGet(client, BASE_URL + "/namespaces");
            Thread.sleep(30); // compressed polling: ~30ms apart simulates realistic sidebar activity
        }

        executor.shutdownNow();

        Arrays.sort(healthTimes);
        Arrays.sort(nsTimes);
        print(String.format("  GET /health     - p50: %dms  p95: %dms",
            percentile(healthTimes, 50), percentile(healthTimes, 95)));
        print(String.format("  GET /namespaces - p50: %dms  p95: %dms",
            percentile(nsTimes, 50), percentile(nsTimes, 95)));

        long slowHealth = Arrays.stream(healthTimes).filter(t -> t > 200).count();
        long slowNs     = Arrays.stream(nsTimes).filter(t -> t > 500).count();
        if (slowHealth == 0 && slowNs == 0)
            print("  PASS - REST stayed responsive while query was in-flight");
        else
            print("  NOTE - " + slowHealth + " slow /health  +  " + slowNs + " slow /namespaces calls");
    }

    // ---------------------------------------------------------------------------
    // WebSocket send-and-wait helper
    // ---------------------------------------------------------------------------

    static void sendWsQuery(HttpClient client, String cellId, String ns, String sql) {
        Instant start  = Instant.now();
        var done       = new CompletableFuture<Boolean>();
        String payload = "{\"cellId\":\"" + cellId + "\",\"namespace\":\"" + ns + "\",\"sql\":\""
                         + sql.replace("\"", "\\\"") + "\"}";

        var listener = new WebSocket.Listener() {
            final StringBuilder buf = new StringBuilder();

            @Override
            public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
                buf.append(data);
                ws.request(1);
                if (!last) return null;
                String msg = buf.toString();
                buf.setLength(0);
                if (msg.contains("\"status\":\"done\"")) {
                    cellLatencies.add(Duration.between(start, Instant.now()).toMillis());
                    successCount.incrementAndGet();
                    done.complete(true);
                } else if (msg.contains("\"status\":\"error\"")) {
                    errorCount.incrementAndGet();
                    done.complete(false);
                }
                return null;
            }

            @Override
            public void onError(WebSocket ws, Throwable t) {
                errorCount.incrementAndGet();
                done.completeExceptionally(t);
            }

            @Override
            public CompletionStage<?> onClose(WebSocket ws, int code, String reason) {
                if (!done.isDone()) {
                    timeoutCount.incrementAndGet();
                    done.complete(false);
                }
                return null;
            }
        };

        try {
            WebSocket ws = client.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .buildAsync(URI.create(WS_URL), listener)
                .get(5, TimeUnit.SECONDS);
            ws.sendText(payload, true);
            done.get(15, TimeUnit.SECONDS);
            ws.sendClose(WebSocket.NORMAL_CLOSURE, "done");
        } catch (TimeoutException e) {
            timeoutCount.incrementAndGet();
            errorCount.incrementAndGet();
        } catch (Exception e) {
            errorCount.incrementAndGet();
        }
    }

    // ---------------------------------------------------------------------------
    // Utilities
    // ---------------------------------------------------------------------------

    static long[] recentLatencies(int lastN) {
        List<Long> all = new ArrayList<>(cellLatencies);
        int from = Math.max(0, all.size() - lastN);
        return all.subList(from, all.size()).stream().mapToLong(Long::longValue).toArray();
    }

    static long measureGet(HttpClient client, String url) {
        try {
            Instant s = Instant.now();
            client.send(HttpRequest.newBuilder(URI.create(url)).GET().build(),
                        HttpResponse.BodyHandlers.discarding());
            return Duration.between(s, Instant.now()).toMillis();
        } catch (Exception e) { return -1L; }
    }

    static boolean serverReachable() {
        try {
            HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create(BASE_URL + "/health")).GET().build(),
                HttpResponse.BodyHandlers.discarding());
            return true;
        } catch (Exception e) { return false; }
    }

    static void printSummary() {
        long total   = successCount.get() + errorCount.get();
        long success = successCount.get();
        long[] arr   = cellLatencies.stream().mapToLong(Long::longValue).sorted().toArray();

        System.out.println("\n=====================================================");
        System.out.println("  LOAD TEST SUMMARY");
        System.out.println("=====================================================");
        System.out.printf("  Total cell executions : %d%n",  total);
        System.out.printf("  Succeeded             : %d%n",  success);
        System.out.printf("  Errors                : %d%n",  errorCount.get());
        System.out.printf("  Timeouts              : %d%n",  timeoutCount.get());
        if (arr.length > 0) {
            System.out.printf("  Cell latency          : p50=%dms  p95=%dms  max=%dms%n",
                percentile(arr, 50), percentile(arr, 95), arr[arr.length - 1]);
        }
        double rate = total > 0 ? success * 100.0 / total : 0;
        System.out.println("=====================================================");
        System.out.println(rate >= 95
            ? "  PASS - success rate above 95%"
            : "  FAIL - success rate " + String.format("%.1f%%", rate) + " (below 95%)");
        System.out.println("=====================================================");
    }

    static long percentile(long[] sorted, int pct) {
        if (sorted.length == 0) return 0;
        int idx = (int) Math.ceil(pct / 100.0 * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
    }

    static void print(String msg) { System.out.println(msg); }

    static void printBanner() {
        System.out.println("=====================================================");
        System.out.println("  sql-notebook Notebook Run-All Load Test");
        System.out.println("  Server   : " + BASE_URL);
        System.out.println("  Namespace: " + NAMESPACE);
        System.out.println("=====================================================");
    }

    static void parseArgs(String[] args) {
        for (int i = 0; i < args.length - 1; i++) {
            switch (args[i]) {
                case "--namespace" -> NAMESPACE = args[++i];
                case "--url"       -> {
                    BASE_URL = args[++i];
                    WS_URL   = BASE_URL.replace("http", "ws") + "/ws/query";
                }
            }
        }
    }
}
