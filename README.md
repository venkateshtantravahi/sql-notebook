# sql-notebook

A Jupyter-like SQL notebook that runs entirely on your machine. Write and execute SQL across multiple databases from a single browser tab — no cloud, no accounts, no setup beyond a config file.

```
$ java -jar sql-notebook.jar
Opening browser at http://localhost:8080...
```

---

## What it does

- Query **MySQL, PostgreSQL, Oracle, SQLite, and Microsoft SQL Server** from one place
- Each cell targets a named connection — switch databases per cell
- Cells run **in parallel** — no waiting for one to finish before running another
- Results appear live as queries complete — no page refresh needed
- Everything stays local — your credentials never leave your machine

---

## Requirements

- Java 17 or higher
- Your databases already running and accessible
- A `sql.properties` file (takes 2 minutes to create)

---

## Installation

Download the latest `sql-notebook.jar` from the [Releases](https://github.com/your-org/sql-notebook/releases) page.

---

## Setup

Create a `sql.properties` file in the same directory as the JAR:

```properties
db.local.type=postgres
db.local.host=localhost
db.local.port=5432
db.local.database=mydb
db.local.user=postgres
db.local.password=secret
```

That's it. The name after `db.` (here: `local`) is your **namespace** — it's how you'll identify this connection in the notebook. You can define as many as you need:

```properties
db.prod.type=mysql
db.prod.host=prod-server.internal
db.prod.port=3306
db.prod.database=app
db.prod.user=readonly
db.prod.password=secret

db.analytics.type=postgres
db.analytics.host=localhost
db.analytics.port=5433
db.analytics.database=warehouse
db.analytics.user=analyst
db.analytics.password=secret
```

See [sql.properties.example](sql.properties.example) for all supported options and database types.

> Never commit `sql.properties` to version control — it contains your credentials. Add it to `.gitignore`.

---

## Running

```bash
java -jar sql-notebook.jar
```

Your browser opens automatically at `http://localhost:8080`. If it doesn't, open it manually.

---

## Supported Databases

| Database             | Config value           | Default port  |
|----------------------|------------------------|---------------|
| PostgreSQL           | `postgres`             | 5432          |
| MySQL                | `mysql`                | 3306          |
| Oracle               | `oracle`               | 1521          |
| SQLite               | `sqlite`               | _(file path)_ |
| Microsoft SQL Server | `microsoft-sql-server` | 1433          |

---

## Configuration Options

| Key                   | Required | Default | Description                                   |
|-----------------------|----------|---------|-----------------------------------------------|
| `db.<name>.type`      | Yes      | —       | Database type (see table above)               |
| `db.<name>.host`      | Yes      | —       | Hostname or IP                                |
| `db.<name>.port`      | Yes      | —       | Port number                                   |
| `db.<name>.database`  | Yes      | —       | Database name (or file path for SQLite)       |
| `db.<name>.user`      | Yes      | —       | Username                                      |
| `db.<name>.password`  | Yes      | —       | Password                                      |
| `db.<name>.pool.size` | No       | `5`     | Max concurrent connections for this namespace |

---

## License

GNU GENERAL PUBLIC LICENSE V3.0

---

> Want to contribute or build from source? See [DEVELOPER.md](DEVELOPER.md).