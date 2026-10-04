# Archive v0.13 — Catalog Integrity Dashboard / Attention Queue

Archive v0.13 adds one protected, read-only operator projection for answering:

> Which catalog facts need attention now, and which existing workflow should handle them?

The dashboard is deliberately **not** a new identity authority. It reads the durable facts introduced in Archive v0.6–v0.12 and derives operational categories from explicit rules.

## Operator route and API

Web route:

- `/catalog-integrity`

Protected API:

- `GET /v1/control/catalog/integrity`

The browser is gated by `MODELAPSE_WEB_OPERATOR_TOKEN`. The Web server uses `MODELAPSE_CONTROL_TOKEN` when calling the API, so the API control credential is never sent to browser JavaScript.

The dashboard deep-links to the existing write workflows instead of duplicating them:

- discovery and promotion work → `/catalog-inbox`
- drift triage → `/identity-review`
- Model-level evidence history → `/identity-cases/:modelId`

## Projection boundary

`PgCatalogIntegrity` is a query-only projection in `@modelapse/catalog-admin`.

It does not:

- promote a Candidate;
- reconcile a remote model ID;
- acknowledge or resolve identity drift;
- rewrite observations, decisions, promotions, reviews, bindings, or source records;
- infer retirement because an ID disappeared from a provider list;
- assign a risk score, confidence score, or AI-generated priority;
- create a second mutable catalog truth.

No new write table is introduced for v0.13. The current read paths are covered by the indexes already added for observer scheduling/history, discovery status/history, promotion lookup, drift review status, execution bindings, and Identity Case history.

## Attention categories

Every count is an explicit operational category.

| Category | Rule |
| --- | --- |
| `collection_failed` | latest collection run for an enabled source is `failed` |
| `collection_partial` | latest collection run for an enabled source is `partial` |
| `collection_stale` | enabled source is beyond twice its configured interval since its last success, or since source creation if it has never succeeded |
| `discovery_unresolved` | Candidate remains in `discovered` |
| `promotion_ready` | Candidate is `promotion_ready` and satisfies the existing `provider-catalog-v1` promotion policy |
| `promotion_blocked` | Candidate is `promotion_ready` but the existing promotion policy reports deterministic blockers |
| `drift_open` | derived identity drift has no resolved review and is currently open |
| `drift_acknowledged` | drift has been acknowledged but not resolved |
| `provenance_incomplete` | canonical Model fails one or more explicit provenance-coherence rules |

A source with a latest failed or partial run is categorized by that run before the stale rule is considered. Disabled sources remain visible as disabled but are not attention items.

## Observer health

The projection exposes:

- enabled state;
- source kind and first-party URL/title;
- last attempted / last succeeded;
- next run;
- latest run status, timestamps, HTTP status, item count, and emitted observation count.

It deliberately does **not** expose `catalog_source_snapshots.response_body` or collection error internals containing arbitrary provider payloads.

The immutable source snapshot remains the evidence boundary. A successful retrieval that later encounters parser or mapping failure can still remain stored as evidence; the dashboard only reports the derived run status.

## Discovery attention

Discovery rows reuse `PgCatalogDiscovery` and its existing `provider-catalog-v1` promotion policy.

The dashboard shows:

- remote model ID;
- observation count;
- first / latest observation times;
- latest provider snapshot ID;
- latest first-party source metadata and content SHA-256;
- policy version and deterministic blockers.

Seeing a remote ID still never creates a canonical Model. Promotion remains an explicit Catalog Inbox action.

## Drift attention

The dashboard reuses the existing drift view and review projection.

It shows:

- open or acknowledged review state;
- changed fields;
- previous/current API model IDs;
- the current evidence source;
- Model linkage when available.

Operator actor names and notes remain in the control-plane review workflow / Identity Case and are not duplicated into the dashboard payload.

## Provenance health

Canonical Model provenance is checked from existing facts:

- canonical source must exist and be a titled, URL-backed first-party `provider_catalog` or `provider_docs` source;
- the Model must have exactly one current `first_party_direct` binding;
- the current binding source must be a titled, URL-backed first-party source;
- if the Model was promotion-created, its immutable promotion audit must use `provider-catalog-v1` and must still point to the Model canonical source.

The projection reports concrete reason codes such as:

- `missing_canonical_source`
- `canonical_source_not_first_party_or_incomplete`
- `missing_current_first_party_binding`
- `multiple_current_first_party_bindings`
- `binding_source_not_first_party_or_incomplete`
- `promotion_audit_mismatch`

These are diagnostics, not repair instructions. v0.13 never auto-fixes a Model.

## Invariants retained

1. Observe first; canonical identity requires an explicit identity workflow.
2. First-party provider catalog/docs/API remain provenance, not automatic authority to promote a remote ID.
3. Operator reconciliation cannot manufacture identity drift.
4. Observation, reconciliation, promotion, and review histories remain append-only.
5. Identity Case and Catalog Integrity are projections only.
6. Provider-list absence does not imply retirement.
7. Raw provider response bodies stay out of normal API and Web projections.
8. Database coordination is not held across provider network I/O.
9. The browser does not receive the API control token.
10. No fuzzy severity or automated adoption decision is introduced.
