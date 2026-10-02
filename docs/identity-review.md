# Archive v0.10 — Identity Review Queue / Drift Triage

Archive v0.10 turns the source-backed identity drift produced since v0.6 into an operator review workflow.

## Boundary

The immutable `catalog_identity_drift_events` view remains the source of truth for what changed. Review state never edits alias resolution history, execution bindings, source records, or drift derivation.

A separate projection records whether a drift event is:

- `open` — default for every drift event, even when no review row exists;
- `acknowledged` — an operator has triaged the event;
- `resolved` — review is complete.

`reopen` returns the projection to `open` while preserving every prior decision.

## Audit model

`catalog_identity_drift_reviews` is the current mutable projection.

`catalog_identity_drift_review_events` is append-only and records `acknowledge`, `resolve`, and `reopen` decisions with actor, note, timestamp, and previous/next state metadata.

The stable key is the v0.6 drift `event_id`, which is derived from immutable alias-resolution or execution-binding record IDs.

## Operator surface

The protected API exposes:

- `GET /v1/control/catalog/drift-reviews?status=open|acknowledged|resolved`
- `POST /v1/control/catalog/drift-reviews/decide`

The Web route `/identity-review` uses the existing server-side operator-token boundary. The browser supplies the operator gate token to the Web server, while the API control credential remains server-side.

The review queue includes provider/model context, changed fields, previous/current API identity, source provenance, and the latest review decision.

## Relationship to Catalog Inbox

Catalog Inbox (v0.9) answers: “Should an unknown first-party remote model be matched, ignored, or explicitly promoted?”

Identity Review (v0.10) answers: “A known identity changed according to first-party evidence; has an operator reviewed that change?”

Neither workflow automatically adopts a provider identity. Promotion remains explicit; drift remains evidence-derived.
