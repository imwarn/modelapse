# ADR 0009 — Production schema migrations run before the API serves traffic

Status: Accepted

## Decision

Modelapse uses a first-party PostgreSQL migration runner in `@modelapse/database`.

The API container executes the migration runner before starting the Hono process. The runner container does not migrate the database.

The Coolify deployment workflow deploys and waits for the API first. Only after the API deployment finishes successfully does it deploy the queue runner.

## Migration ledger

The runner owns:

```text
modelapse.schema_migrations
```

Each applied migration records:

- migration filename;
- SHA-256 of the exact SQL file;
- application time;
- immutable Modelapse build identifier.

If an already-applied migration file changes, migration stops with a checksum mismatch.

Historical migration files are therefore immutable.

## Atomicity

Existing SQL migrations retain their human-readable outer:

```sql
BEGIN;
...
COMMIT;
```

The migration runner validates this envelope, removes the outer transaction statements in memory, and then performs:

```text
BEGIN
  migration body
  INSERT schema_migrations row
COMMIT
```

The schema change and its ledger record commit atomically.

## Concurrency

A PostgreSQL advisory lock serializes migration execution:

```text
modelapse:migrations
```

Concurrent API starts cannot apply the same migration at the same time.

## Deployment ordering

Production deployment is:

```text
publish API + runner images
        |
        v
deploy API
        |
        +--> acquire migration lock
        +--> apply pending migrations
        +--> start HTTP server
        |
        v
Coolify API deployment finished
        |
        v
deploy runner
```

A migration failure prevents the API process from starting and therefore blocks the runner deployment.

## Operational boundary

The production database should remain on Coolify private networking. API and runner use its Internal URL as `DATABASE_URL`.

For the current single-role baseline, that database credential can perform the required DDL. A later hardening milestone may split schema-owner/migrator and application runtime database roles.
