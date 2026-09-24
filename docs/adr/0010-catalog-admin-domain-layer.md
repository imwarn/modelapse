# ADR 0010 — Catalog writes use a shared admin domain layer

Status: Accepted

## Decision

Modelapse introduces `@modelapse/catalog-admin` as the authoritative write layer for curated catalog administration.

The first interface is a production CLI packaged inside the runner image.

A general web admin platform is deferred until the catalog workflows require repeated human editing and review.

## Rationale

The current milestone needs one safe production bootstrap, not a broad CRUD surface.

Building the domain write rules first prevents a future admin UI from becoming an alternate authority over PostgreSQL.

The catalog admin layer owns:

- content-addressed prompt persistence;
- blob descriptor verification;
- source/provenance requirements;
- provider endpoint identity checks;
- Test Family and Variant identity checks;
- Test Version definition hashes;
- draft → published sequencing;
- immutable published cases;
- idempotent repeated operations;
- conflict detection.

## Administrative surfaces

The intended layering is:

```text
future web admin
       |
future authenticated admin API
       |
       v
@modelapse/catalog-admin
       |
       +--> BlobStore
       +--> PostgreSQL catalog
```

The current CLI calls the same domain layer directly:

```text
Coolify runner terminal
       |
       v
catalog-admin CLI
       |
       v
@modelapse/catalog-admin
```

## Security boundary

The CLI runs in the runner runtime because that process already has access to the production database and CAS volume.

The API process does not gain arbitrary catalog mutation capabilities in this milestone.

Provider credentials are not read by the bootstrap operation and are not written into catalog tables or blobs.

## First canonical bootstrap

v0.1 contains one intentionally narrow operation:

```text
bootstrap-openai-smoke
```

It creates the sourced OpenAI first-party endpoint plus one published deterministic Test Case suitable for a live E4 smoke Run.

Additional catalog operations should be added as explicit domain methods rather than a generic SQL/JSON mutation endpoint.
