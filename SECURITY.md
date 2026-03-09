# Security Policy

## Supported Versions

Only the latest release of sql-notebook receives security fixes. We do not backport patches to older versions.

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| Older   | No        |

---

## Scope

sql-notebook is a **local-only tool**. It runs as a single-user process on your machine and is not designed to be exposed to the public internet. The HTTP server binds to `localhost` by default. Running it on a public-facing interface is outside the intended use case and not a supported configuration.

Security considerations that are **in scope** for this project:

- Unsafe handling of database credentials read from `sql.properties`
- SQL injection or query injection through the notebook interface
- Path traversal or arbitrary file read via the file browser or file-source features
- Authentication bypass (if authentication is added in future)
- Dependency vulnerabilities in bundled libraries (JDBC drivers, Jetty, DuckDB, etc.)
- Insecure defaults that could expose the server to the local network unintentionally

Issues that are **out of scope:**

- Attacks requiring physical access to the machine running sql-notebook
- Vulnerabilities in databases that sql-notebook connects to (report these upstream)
- Issues that only affect users who have intentionally exposed the server to untrusted networks

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a vulnerability privately:

1. Go to the [Security tab](https://github.com/venkateshtantravahi/sql-notebook/security) of this repository.
2. Click **"Report a vulnerability"** to open a private advisory.
3. Provide as much detail as possible — see the template below.

If you are unable to use GitHub's private advisory feature, contact the maintainer directly through their [GitHub profile](https://github.com/venkateshtantravahi).

---

## What to Include in a Report

A useful report helps us reproduce and fix the issue quickly. Please include:

- **Description** — what the vulnerability is and what impact it could have
- **Affected component** — e.g. file browser handler, DuckDB file source, HTTP server, config parser
- **Steps to reproduce** — a minimal, clear sequence of actions that demonstrates the issue
- **Proof of concept** — a test case, payload, or script if applicable
- **Suggested fix** — optional, but always appreciated

---

## Response Process

| Step                                         | Target timeframe                                      |
|----------------------------------------------|-------------------------------------------------------|
| Acknowledgement of report                    | Within 3 business days                                |
| Initial assessment (in scope / out of scope) | Within 7 business days                                |
| Fix developed and tested                     | Depends on severity — critical issues are prioritised |
| Patched release published                    | As soon as the fix is ready                           |
| Public disclosure                            | After a patched release is available                  |

We will keep you informed throughout the process. If you have not received a response within 7 days, please follow up.

---

## Security Best Practices for Users

Because sql-notebook reads database credentials from `sql.properties`:

- **Restrict file permissions** — set `sql.properties` to be readable only by your user (`chmod 600 sql.properties`)
- **Use read-only database accounts** where possible — sql-notebook does not require write access for most use cases
- **Do not expose the server to untrusted networks** — the default `localhost` binding is intentional; do not override it unless you understand the risks
- **Keep dependencies up to date** — pull the latest release to get patched dependencies

---

## Disclosure Policy

We follow a **coordinated disclosure** model. We ask that you give us a reasonable amount of time to fix and release a patch before making the vulnerability public. We will credit reporters in the release notes unless they prefer to remain anonymous.
