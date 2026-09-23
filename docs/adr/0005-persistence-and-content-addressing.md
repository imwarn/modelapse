# ADR 0005 — PostgreSQL persistence and content-addressed blobs

Status: Accepted for persistence v0.1

## Decision

Run metadata, evidence references, attestations and catalog relations remain in PostgreSQL. Raw request/response bytes, response headers and attestation payload bytes are stored through a content-addressed BlobStore.

The first concrete BlobStore adapter is filesystem-backed for development and single-host deployments. Its object key is derived only from SHA-256:

```text
sha256/ab/cd/abcdef...
```

The BlobStore interface is intentionally storage-provider neutral so an S3/R2/MinIO adapter can be added without changing Run or database semantics.

## Write ordering

Blob bytes are written before the PostgreSQL sealing transaction.

This means a process crash may leave an unreferenced object, but PostgreSQL must never commit a reference to bytes that were not successfully stored first. Orphan objects are safe to garbage-collect later by comparing object keys with the blobs table.

## Immutability

- blobs are append-only;
- a Run may change state until sealed;
- once sealed_at is set, the Run row cannot be updated or deleted;
- sealing the same Run with the same request/response hashes is treated as an idempotent retry;
- sealing an already-sealed Run with different hashes is rejected.

## Public API boundary

The public Run read API exposes hashes and blob descriptors, not raw request/response bytes.

Run creation is a control-plane action and is disabled unless MODELAPSE_CONTROL_TOKEN is configured. Runner sealing is not exposed as a public HTTP endpoint; controlled workers persist through the repository/recorder contract.

## Production object storage

Filesystem storage is not the final multi-host production adapter. A later S3-compatible adapter should preserve the same content-addressing rules and should not alter the relational schema or public Run representation.
