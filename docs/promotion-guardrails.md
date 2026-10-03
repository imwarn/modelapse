# Archive v0.11 — Promotion Guardrails / Atomic Promotion

Archive v0.11 hardens the v0.9 Candidate Inbox promotion boundary.

## Why this exists

Discovery and review already require an explicit operator decision, but promotion previously crossed two database transactions:

1. register the canonical Model, execution binding, and alias;
2. finalize the Candidate reconciliation and immutable promotion audit.

A failure or concurrent state change between those steps could theoretically leave a canonical Model registered without a matching promotion event.

v0.11 removes that split.

## One transaction

`PgModelCatalogAdmin.registerFirstPartyModel()` remains the public transaction-owning registration API.

Its registration primitive is now also available on an existing PostgreSQL `PoolClient`. Candidate promotion uses that primitive after locking the Candidate, so all of these operations commit or roll back together:

- Candidate lock and policy re-check;
- canonical Model registration;
- first-party execution binding;
- alias / initial alias resolution;
- reconciliation event;
- Candidate transition to `matched`;
- immutable promotion event.

The promotion path never holds a transaction across network I/O.

## Promotion policy v1

Policy version: `provider-catalog-v1`.

A Candidate is eligible only when all of the following are true at promotion time:

- Candidate state is `promotion_ready`;
- the Candidate has not already been promoted;
- the latest source is `provider_catalog`;
- the latest source has a URL and title;
- the latest source is content-addressed with a lowercase SHA-256 digest.

The Catalog Inbox displays the server-computed eligibility and blockers, but the UI is not authoritative. The same policy is recomputed after the Candidate row is locked inside the promotion transaction.

## Immutable evidence snapshot

`catalog_promotion_events` now records:

- `policy_version`;
- an `evidence` JSON snapshot including source record ID, source type, content SHA-256, retrieval time, observation count, and Candidate first/last seen times.

PostgreSQL validation independently checks that a new promotion:

- uses the Candidate's current latest source;
- uses the Model's canonical source;
- uses `provider_catalog` evidence;
- uses URL-backed, titled, content-addressed evidence;
- uses the supported policy version;
- records an evidence snapshot consistent with the referenced source.

Existing promotion events remain append-only.

## Failure semantics

If promotion audit insertion fails, canonical Model registration and all derived binding/alias writes roll back with the Candidate transition. There is no successful partial promotion state.

Integration coverage installs a deliberate failing promotion trigger, verifies the attempted Model/binding do not survive, then removes the failure and completes promotion normally.
