# @modelapse/database

Plain PostgreSQL migrations remain the source of truth.

Why no ORM schema yet:

- the data model contains temporal relations, append-only evidence and immutability triggers that should be explicit;
- the public domain contracts should not depend on an ORM;
- an ORM/query layer can be added after the schema stabilizes without becoming the schema definition.

## Migration runner

Build and run:

```bash
npm run build -w @modelapse/database
DATABASE_URL=postgres://... npm run migrate -w @modelapse/database
```

The runner:

- serializes concurrent migration attempts with a PostgreSQL advisory lock;
- records applied files in `modelapse.schema_migrations`;
- stores the SHA-256 of each exact migration file;
- refuses to continue if an already-applied migration was modified;
- applies each migration and its ledger row in the same transaction;
- is safe to run repeatedly.

Migration files must keep one outer `BEGIN; ... COMMIT;` envelope. The runner owns the actual transaction at runtime so the schema change and migration ledger record are atomic.

Historical migration files are immutable after application. Add a new numbered migration instead of editing an applied file.

## Current schema

The migrations establish:

- provider endpoints and model lineage;
- snapshot / alias resolution history;
- test family → variant → version → case;
- runs and provider metadata;
- evidence records and signed run attestations;
- content-addressed blobs and artifacts;
- versioned evaluations and metrics;
- community candidate/submission intake;
- durable Run job orchestration.

Secrets such as API keys must never enter these tables or blob storage.
