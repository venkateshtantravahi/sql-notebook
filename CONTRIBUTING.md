# Contributing to sql-notebook

Thank you for your interest in contributing. This document covers everything you need to get started — branching strategy, commit conventions, PR process, and how to run tests locally.

---

## Prerequisites

Before you begin, make sure you have:

- **Java 17+** installed (`java -version`)
- **Docker** running — integration tests use [Testcontainers](https://testcontainers.com) to spin up real database containers automatically. Without Docker, tests will fail.
- **Git** configured with your name and email

---

## Getting Started

```bash
# Clone the repo
git clone https://github.com/your-org/sql-notebook.git
cd sql-notebook

# Build
./gradlew build

# Run all tests (Docker must be running)
./gradlew test
```

---

## Branching Strategy

We use a three-tier branching model:

```
main          ← always stable, always tagged
  └── dev     ← integration branch, all features merge here first
        └── feat/your-feature   ← your working branch
```

**Rules:**
- Never push directly to `main` or `dev`
- Every piece of work — feature, bug fix, docs update — gets its own branch
- Branch from `dev`, merge back to `dev` via PR
- `dev` → `main` only when a milestone is complete and all tests pass

---

## Branch Naming

Branch names are enforced by CI. Use one of these prefixes:

| Prefix | Use for |
|---|---|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `test/` | Adding or fixing tests |
| `chore/` | Build, CI, tooling changes |
| `refactor/` | Code restructuring without behaviour change |

**Examples:**
```
feat/websocket
fix/oracle-jdbc-url
docs/update-readme
chore/clean-dependencies
```

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>
```

**Examples:**
```
feat(server): add WebSocket endpoint for live query execution
fix(connection): correct Oracle JDBC URL to use service name format
docs(config): add pool.size default value to reference
test(executor): add parallel execution integration test
chore(build): remove unused sqlite dependency
```

- Keep the subject line under 72 characters
- Use present tense ("add" not "added")
- Scope is the module name: `config`, `connection`, `executor`, `server`, `websocket`

---

## Pull Request Process

**1. Open a PR from your branch to `dev` (never directly to `main`)**

**2. PR titles are enforced by CI** — they must follow the same Conventional Commits format:
```
feat(scope): description
fix(scope): description
```

**3. Fill in the PR template** — GitHub will auto-populate it when you open a PR. Don't skip sections.

**4. Self-review checklist before requesting review:**
- [ ] All tests pass locally (`./gradlew test`)
- [ ] New code has tests covering the main behaviour and error cases
- [ ] Any new module has a corresponding `docs/*.adoc` file
- [ ] No commented-out code left behind
- [ ] No hardcoded credentials or local paths

**5. CI must be green** before merging — the pipeline runs build + test on every PR.

---

## Running Tests

```bash
# Run all tests
./gradlew test

# Run tests for a specific class
./gradlew test --tests "io.sqlnotebook.server.QueryWebSocketTest"

# Run tests and see full output (no truncation)
./gradlew test --info
```

> **Testcontainers** will automatically pull Docker images for MySQL, PostgreSQL, Oracle, and MSSQL the first time tests run. Subsequent runs use cached images and are much faster.

---

## Module Overview

| Module | Package | What it does |
|---|---|---|
| Config Parser | `io.sqlnotebook.config` | Parses `sql.properties` into typed config objects |
| Connection Registry | `io.sqlnotebook.connection` | Creates and manages one HikariCP pool per namespace |
| Query Executor | `io.sqlnotebook.executor` | Submits SQL to a thread pool, returns `Future<QueryResult>` |
| HTTP Server | `io.sqlnotebook.server` | Embedded Jetty with REST endpoints |
| WebSocket | `io.sqlnotebook.server` | Live query execution updates over WebSocket |

See [docs/developer-guide.adoc](docs/developer-guide.adoc) for how these modules connect end to end.

---

## Code Style

- Standard Java formatting — no tabs, 4-space indentation
- Prefer records over classes for pure data carriers (`ConnectionConfig`, `QueryResult`, etc.)
- Avoid checked exceptions bubbling out of module boundaries — wrap in unchecked module-specific exceptions (`ConfigException`, `ConnectionRegistryException`)
- New public classes must have at minimum a class-level Javadoc comment explaining their purpose

---

## Adding a New Database Type

1. Add the new type string to the validation in `ConfigParser.java`
2. Add the JDBC URL format in `ConnectionRegistry.java`
3. Add the JDBC driver dependency in `build.gradle.kts`
4. Add a Testcontainers integration test in `ConnectionRegistryTest.java`
5. Update `docs/config-parser.adoc` with the new type and any type-specific config options
6. Update `sql.properties.example` with an example entry

---

## Questions

Open an issue with the `question` label if you're unsure about anything before starting work. It's better to align early than to build in the wrong direction.