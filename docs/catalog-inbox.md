# Candidate Inbox / Promotion Workflow

Archive v0.9 turns the v0.8 Catalog Discovery queue into a server-gated operator workflow.

## Boundary

Discovery is still evidence, not canonical identity.

The workflow is deliberately two-step:

```text
discovered
  -> operator review
  -> promotion_ready
  -> explicit canonical fields
  -> canonical Model registration
  -> matched
```

There is no `discovered -> Model` shortcut. Candidates may also be ignored and later reopened. All reconciliation decisions remain append-only.

## Operator surface

The Web route is `/catalog-inbox`.

Browser users provide `MODELAPSE_WEB_OPERATOR_TOKEN`. It is verified by the TanStack Start server function and is not forwarded to the API. The Web server uses its server-side `MODELAPSE_CONTROL_TOKEN` for API calls; that API credential is never returned to browser code.

Controlled API endpoints:

```text
GET  /v1/control/catalog/discoveries
POST /v1/control/catalog/discoveries/:candidateId/reconcile
POST /v1/control/catalog/discoveries/:candidateId/promote
```

All require the control Bearer token.

## Promotion prerequisites

Promotion requires:

- Candidate state `promotion_ready`;
- latest Candidate evidence to be a `provider_catalog` source;
- a URL-backed first-party source record;
- explicit canonical slug and marketing name;
- explicit initial status (`preview` or `active`);
- operator identity for the audit trail.

The remote model ID becomes the initial first-party execution binding only after those checks.

Docs-derived discoveries cannot be promoted through this path. This prevents future heuristic docs parsers from creating canonical identity without stronger first-party model-list evidence.

## Provenance

Promotion reuses the Candidate's existing `last_source_record_id`. It does not create a synthetic fresh retrieval merely because an operator clicked Promote.

The registration primitive validates that the supplied source record has the expected source type, URL and title. The resulting Model canonical source and initial execution binding therefore point back to the same immutable collection evidence that produced the Candidate.

## Promotion audit

Migration `0011_catalog_candidate_promotion.sql` adds append-only `catalog_promotion_events`.

Each event records Candidate, created Model, canonical source record, canonical slug, marketing name, initial status, operator actor, timestamp, and metadata. A Candidate can be promoted at most once.

Database validation checks that Candidate and Model share a Provider and that the promotion source is the Model's canonical source.

## Drift semantics

Promotion creates the initial canonical Model, alias and first-party execution binding. It is not drift because there was no prior canonical binding to change.

Later provider observations continue through the v0.6 identity observer. Only subsequent source-backed changes can close the promoted binding and produce identity drift.

## UI evidence

The Inbox displays Provider, remote model ID, observation count, first/last seen time, source type, source SHA-256 prefix, first-party source URL, and current reconciliation state.

Canonical slug and marketing-name suggestions are UI conveniences only. The operator must explicitly submit them and the backend validates them again.
