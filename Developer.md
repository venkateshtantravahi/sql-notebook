# Developer Guide

This document covers the backend architecture of sql-notebook — how the five modules connect, how data flows through the system, and what you need to know to confidently fix bugs or add new features.

For setup, git workflow, commit conventions, and the PR process → see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Module Breakdown](#module-breakdown)
- [Data Flow](#data-flow)
- [Thread Model](#thread-model)
- [Error Handling Philosophy](#error-handling-philosophy)
- [Extending the Project](#extending-the-project)
- [Module Documentation](#module-documentation)

---

## Architecture Overview

The backend is five modules wired together in a strict one-way dependency chain. Each module depends only on the ones below it — nothing knows about what's above it.

```
sql.properties
      │
      ▼
 ConfigParser          Reads and validates the config file
      │
      ▼
 ConnectionRegistry    Creates one HikariCP pool per namespace
      │
      ▼
 QueryExecutor         Submits SQL to a thread pool, returns Future<QueryResult>
      │
      ▼
 HttpServer (Jetty)    Exposes everything over HTTP and WebSocket
      │
      ├── GET  /namespaces  →  NamespaceHandler  →  ConnectionRegistry
      ├── POST /query       →  QueryHandler      →  QueryExecutor
      └── WS   /ws/query   →  QueryWebSocket    →  QueryExecutor
```

`QueryExecutor` has no knowledge of Jetty. `ConnectionRegistry` has no knowledge of `QueryExecutor`. `ConfigParser` has no knowledge of anything else. This one-way chain makes every module independently testable and replaceable.

---

## Module Breakdown

### 1. Config Parser — `io.sqlnotebook.config`

Reads `sql.properties` from disk, validates every entry, and returns a typed `Map<String, ConnectionConfig>` keyed by namespace name.

| Class              | Role                                                                                            |
|--------------------|-------------------------------------------------------------------------------------------------|
| `ConfigParser`     | Reads the properties file, groups keys by namespace, validates required fields, returns the map |
| `ConnectionConfig` | Immutable record: `namespace, type, host, port, database, user, password, poolSize`             |
| `ConfigException`  | Unchecked — thrown on missing fields, unsupported DB type, or file not found                    |

Validates that the file exists, all required keys are present per namespace, `type` is one of the five supported values, and defaults `pool.size` to `5` if absent.

→ [docs/config-parser.adoc](docs/config-parser.adoc)

---

### 2. Connection Registry — `io.sqlnotebook.connection`

Takes the parsed configs and creates one `HikariDataSource` per namespace. Hands out `Connection` objects on demand and manages pool shutdown.

| Class                         | Role                                                                                                              |
|-------------------------------|-------------------------------------------------------------------------------------------------------------------|
| `ConnectionRegistry`          | Holds `Map<String, HikariDataSource>`. Builds JDBC URLs. Exposes `getConnection(namespace)` and `getNamespaces()` |
| `ConnectionRegistryException` | Unchecked — thrown when an unknown namespace is requested                                                         |

JDBC URL formats built internally:

| Type       | Format                                                                   |
|------------|--------------------------------------------------------------------------|
| PostgreSQL | `jdbc:postgresql://host:port/database`                                   |
| MySQL      | `jdbc:mysql://host:port/database`                                        |
| Oracle     | `jdbc:oracle:thin:@//host:port/service_name`                             |
| SQLite     | `jdbc:sqlite:path/to/file.db`                                            |
| MSSQL      | `jdbc:sqlserver://host:port;databaseName=db;trustServerCertificate=true` |

→ [docs/connection-registry.adoc](docs/connection-registry.adoc)

---

### 3. Query Executor — `io.sqlnotebook.executor`

Accepts a namespace + SQL string, acquires a connection from the registry, runs the query on a thread pool, and returns a `Future<QueryResult>`. Never throws for SQL-level errors — wraps them in the result instead.

| Class                    | Role                                                                                                   |
|--------------------------|--------------------------------------------------------------------------------------------------------|
| `QueryExecutor`          | Wraps an `ExecutorService`. `execute(namespace, sql)` submits a task and returns `Future<QueryResult>` |
| `QueryResult`            | Immutable record: `namespace, sql, columns, rows, executionTimeMs, success, errorMessage`              |
| `QueryExecutorException` | Unchecked — thrown for infrastructure failures only, never for SQL errors                              |

> SQL errors (bad table, bad syntax) set `success=false` and populate `errorMessage`. They do not throw. This keeps both the HTTP and WebSocket layers simple — they always receive a `QueryResult` regardless of whether the SQL succeeded.

→ [docs/query-executor.adoc](docs/query-executor.adoc)

---

### 4. HTTP Server — `io.sqlnotebook.server`

Starts an embedded Jetty server and exposes two blocking REST endpoints alongside the WebSocket endpoint.

| Class              | Role                                                                                                             |
|--------------------|------------------------------------------------------------------------------------------------------------------|
| `HttpServer`       | Configures Jetty, mounts all servlets and the WebSocket endpoint, owns server lifecycle                          |
| `NamespaceHandler` | `GET /namespaces` — returns `Set<String>` of namespace names as JSON                                             |
| `QueryHandler`     | `POST /query` — reads `{namespace, sql}` body, calls executor, blocks on `Future`, returns `QueryResult` as JSON |

→ [docs/http-server.adoc](docs/http-server.adoc)

---

### 5. WebSocket — `io.sqlnotebook.server`

Persistent connection for live query execution. Browser sends a query, server immediately pushes `running`, then pushes `done` or `error` when execution completes. Multiple cells can be in-flight simultaneously on one connection.

| Class            | Role                                                                   |
|------------------|------------------------------------------------------------------------|
| `QueryWebSocket` | `@ServerEndpoint("/ws/query")` — handles the full connection lifecycle |
| `QueryRequest`   | Incoming message record: `cellId, namespace, sql`                      |
| `QueryResponse`  | Outgoing message record: `cellId, status, result, error`               |

```
Browser sends:   { "cellId": "cell-1", "namespace": "local", "sql": "SELECT ..." }
Server pushes:   { "cellId": "cell-1", "status": "running" }            ← immediate
Server pushes:   { "cellId": "cell-1", "status": "done", "result": … }  ← on completion
```

→ [docs/websocket.adoc](docs/websocket.adoc)

---

## Data Flow

### Startup

```
main()
  ├── ConfigParser.parse("sql.properties")  →  Map<String, ConnectionConfig>
  ├── new ConnectionRegistry(configs)       →  one HikariPool per namespace
  ├── new QueryExecutor(registry)           →  thread pool ready
  ├── new HttpServer(registry, executor, 8080)
  │     ├── mounts /namespaces, /query
  │     └── registers /ws/query
  └── server.start() → Desktop.browse("http://localhost:8080")
```

### HTTP query (POST /query)

```
Browser
  │── POST /query {"namespace":"local","sql":"SELECT 1"} ──► QueryHandler.doPost()
                                                                  ├── parse + validate body
                                                                  ├── executor.execute(namespace, sql)
                                                                  │     └── registry.getConnection(namespace)
                                                                  │     └── statement.executeQuery(sql)
                                                                  │     └── build QueryResult
                                                                  └── future.get() → write JSON
  │◄── 200 OK { columns, rows, executionTimeMs, success } ────────┘
```

### WebSocket query (ws/query)

```
Browser
  │── WS connect ──────────────────────────────────────────► onOpen()
  │── { cellId, namespace, sql } ──────────────────────────► onMessage()
                                                                  ├── parse into QueryRequest
                                                                  ├── push { status: "running" }   ← immediate
                                                                  ├── executor.execute() → Future
                                                                  └── Thread.ofVirtual().start(() -> {
                                                                            result = future.get()
                                                                            push { status: "done", result }
                                                                        })
  │◄── { cellId, status: "running" } ──────────────────────────── immediately
  │◄── { cellId, status: "done", result: {...} } ────────────────  when query finishes
```

---

## Thread Model

```
Jetty acceptor threads      accept HTTP and WebSocket connections
Jetty handler threads       run NamespaceHandler and QueryHandler (short, non-blocking)
QueryExecutor thread pool   run actual JDBC queries (potentially long-running)
Virtual threads             one per in-flight WebSocket query, waits on Future
```

Virtual threads are used in `QueryWebSocket` because Jetty's message handler runs on a Jetty-managed thread. Blocking that thread on `future.get()` would prevent other messages from being processed on the same connection, killing parallel cell execution. Virtual threads cost almost nothing to create, so one is spun per query just to wait and push the response.

---

## Error Handling Philosophy

| Error type     | Example                                    | How it surfaces                                                                |
|----------------|--------------------------------------------|--------------------------------------------------------------------------------|
| SQL / DB-level | Bad table, syntax error                    | `QueryResult.success = false`, `errorMessage` set. HTTP 200. WS status `done`. |
| Infrastructure | Unknown namespace, missing field, bad JSON | HTTP 4xx. WS status `error`. Never reaches the executor.                       |

The frontend only needs to check `result.success` for query errors — HTTP status codes exclusively reflect infrastructure problems. This keeps UI logic consistent across both the HTTP and WebSocket paths.

---

## Extending the Project

### Adding a new REST endpoint

1. Create a class extending `HttpServlet` in `io.sqlnotebook.server`
2. Override `doGet` or `doPost`
3. Mount it in `HttpServer`: `context.addServlet(new ServletHolder(new YourHandler(...)), "/path")`
4. Write integration tests following the pattern in `HttpServerTest`
5. Document it in `docs/http-server.adoc`

### Adding a new database type

1. Add the type string to the allowed list in `ConfigParser.java`
2. Add the JDBC URL builder branch in `ConnectionRegistry.java`
3. Add the JDBC driver in `build.gradle.kts` (`implementation`)
4. Add the Testcontainers module in `build.gradle.kts` (`testImplementation`)
5. Add a real container integration test in `ConnectionRegistryTest`
6. Update `docs/config-parser.adoc` and `sql.properties.example`

### Modifying QueryResult

`QueryResult` is used across `QueryExecutor`, `QueryHandler`, and `QueryWebSocket`. Adding a field automatically includes it in all JSON responses since Jackson serialises all record components. Remember to update test assertions and the response examples in `docs/http-server.adoc` and `docs/websocket.adoc`.

---

## Module Documentation

Full API detail for each module lives in the `docs/` directory:

| Document                                                       | What it covers                                                           |
|----------------------------------------------------------------|--------------------------------------------------------------------------|
| [docs/config-parser.adoc](docs/config-parser.adoc)             | `sql.properties` format, all keys, validation rules, error cases         |
| [docs/connection-registry.adoc](docs/connection-registry.adoc) | JDBC URL formats per DB type, pool config, shutdown behaviour            |
| [docs/query-executor.adoc](docs/query-executor.adoc)           | Thread pool, `QueryResult` structure, error handling, parallel execution |
| [docs/http-server.adoc](docs/http-server.adoc)                 | REST endpoints, request/response schemas, HTTP status codes              |
| [docs/websocket.adoc](docs/websocket.adoc)                     | WebSocket protocol, message schemas, parallel cells, JS client example   |