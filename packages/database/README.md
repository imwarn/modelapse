# @modelapse/database

Plain PostgreSQL migrations are the source of truth for the first schema iteration.

Why no ORM schema yet:

- the data model contains temporal relations, append-only evidence and immutability triggers that should be explicit;
- the public domain contracts should not depend on an ORM;
- an ORM/query layer can be added after the schema stabilizes without becoming the schema definition.

## Migration 0001

`migrations/0001_core.sql` establishes:

- provider endpoints and model lineage;
- snapshot / alias resolution history;
- test family → variant → version → case;
- runs and provider metadata;
- evidence records and signed run attestations;
- content-addressed blobs and artifacts;
- versioned evaluations and metrics;
- community candidate/submission intake.

Important: secrets such as API keys must never enter these tables or blob storage.
