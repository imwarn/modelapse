# Archive v0.12 — Identity Case / Evidence Timeline

Archive v0.12 adds a read-only operator projection that reconstructs one canonical Model's catalog identity history across the workflows introduced in v0.8–v0.11.

## Question answered

Earlier Archive stages intentionally kept separate responsibilities:

- Catalog Observer records first-party source snapshots.
- Catalog Discovery records unknown remote IDs and observations.
- Reconciliation records operator decisions.
- Promotion creates a canonical Model only through explicit audited action.
- Identity Drift derives changes from immutable identity history.
- Drift Review records operator triage without rewriting drift.

Identity Case answers a different question:

> For this canonical Model, what evidence and decisions led here, including historical links that are no longer the current Candidate state?

It is a projection only. It does not create a new identity authority.

## Historical reach

A Candidate is included when the Model is linked by any of:

- the Candidate's current `resolved_model_id`;
- an immutable Promotion Event;
- any historical reconciliation decision that resolved the Candidate to the Model.

That last rule is important. A Candidate that was once matched to a Model, then ignored/reopened/promoted differently, remains visible in the original Model's Identity Case.

## Case contents

The protected case projection includes:

- canonical Model and Provider identity;
- every related Catalog Discovery Candidate;
- append-only discovery observations and source metadata;
- reconciliation decisions, actors, notes, and historical resolved Model IDs;
- immutable promotion event, policy version, evidence snapshot, and source;
- source-backed identity drift events;
- current drift review projection;
- append-only acknowledge / resolve / reopen review decisions;
- one merged chronological evidence timeline.

Raw provider response bodies are deliberately excluded. Source references expose provenance metadata and content hashes only.

## Control boundary

Operator decision notes and actor names are not added to the public Archive API.

Protected endpoint:

- `GET /v1/control/catalog/identity-cases/:modelId`

The Web route is:

- `/identity-cases/:modelId`

The browser still uses the existing `MODELAPSE_WEB_OPERATOR_TOKEN` gate. The API control token remains server-side.

Catalog Inbox links matched/promoted Models into their Identity Case. Identity Review links drift events into the same Model-level case.

## Query support

Migration `0014_catalog_identity_case_indexes.sql` adds read-path indexes for:

- Candidate current resolution by Model;
- historical reconciliation resolution by Model.

No source, Candidate, reconciliation, promotion, binding, alias, drift, or review record is mutated by Identity Case reads.

## Invariants

1. Identity Case is derived from existing durable facts.
2. Historical decisions remain visible even after current state changes.
3. Operator-only annotations stay behind the control plane.
4. Raw provider response bodies are not surfaced.
5. No case read can promote, reconcile, acknowledge, resolve, or otherwise mutate catalog identity.
