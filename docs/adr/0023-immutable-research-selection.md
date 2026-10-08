# ADR 0023 — Saved research collections freeze Run identity, not live query results

## Status

Accepted for Archive v0.27.

## Context

Archive v0.26 offers shareable filter URLs, but rerunning a query after new collection may return different Runs. A published research citation must not silently expand or drift.

Anonymous persistence endpoints would also permit unauthenticated public content creation and abuse.

## Decision

1. Define research collections as append-only manifests of validated filters and **ordered sealed public non-calibration Run IDs**.
2. Allow collection capture only through the operator-authenticated control API.
3. Make saved collection reading and structured JSON/CSV export public.
4. Cap captures at 50 Runs and reject empty, oversized, or cursor-restricted selections.
5. Compute a canonical SHA-256 selection-manifest digest; verify it when reading.
6. Validate snapshot membership with PostgreSQL trigger rules and prevent updates/deletes.
7. Keep CSV exports safe from spreadsheet formula injection, preserve evidence source references and unknown cost as unknown.
8. Distinguish query replay from fixed Run membership and from derived policy eligibility.
9. Treat the manifest hash as selection identity, not as a provider-signed result or a hash of all response blobs.
10. Never change the immutable Run, Evaluation, qualification or cost ledger as part of research snapshot creation.

## Consequences

Public citations can reference stable evidence selections while allowing live faceted discovery to evolve. Longer research collections need a future explicit bounded-batch protocol instead of truncating queries without disclosure.
