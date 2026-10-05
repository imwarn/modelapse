# Archive v0.16 — Catalog Presence Review / Lifecycle Triage

Archive v0.16 adds an explicit operator review workflow for the conservative presence-gap evidence introduced in v0.15.

The question is:

> A remote model ID was present in one complete first-party model-list snapshot and not observed in the next complete snapshot. Has an operator reviewed that evidence yet?

The workflow deliberately does **not** answer:

> Is the model retired, deprecated, deleted, invalid, unavailable, or replaced?

Presence review is operational triage only.

## Operator route and API

Web:

- `/catalog-presence-review`

Protected API:

- `GET /v1/control/catalog/presence-reviews`
  - optional `status=open|acknowledged|resolved`
  - optional `limit=1..200`
- `POST /v1/control/catalog/presence-reviews/decide`

Decision actions:

- `acknowledge`
- `resolve`
- `reopen`

The browser still sends only `MODELAPSE_WEB_OPERATOR_TOKEN` to the TanStack Start server function. `MODELAPSE_CONTROL_TOKEN` remains server-side.

## Evidence boundary

Only v0.15 events with:

```text
kind = not_observed_in_complete_snapshot
interpretation = not_observed_in_complete_model_list_evidence
```

are reviewable.

The first decision against an event validates that the derived absence event still exists in the evidence-backed presence history.

After that first decision, the review keeps immutable anchors to:

- Provider;
- observer source;
- current complete collection run;
- previous complete collection run;
- remote model ID;
- event occurrence time.

That lets the audit remain inspectable even if the event later ages outside the default v0.15 comparison window.

## Persistence

Migration `0016_catalog_presence_review.sql` adds:

### `catalog_presence_reviews`

A current operator-review summary keyed by the derived presence event ID.

It stores:

- evidence anchors;
- review status;
- acknowledge / resolve timestamps;
- update timestamp.

Allowed current states:

- `open`
- `acknowledged`
- `resolved`

### `catalog_presence_review_events`

Append-only operator decisions:

- action;
- actor;
- note;
- decision time;
- metadata containing the previous and next review state plus the non-retirement interpretation.

The table uses the shared append-only mutation trigger. Historical review decisions cannot be updated or deleted.

## State machine

The review state machine mirrors the explicit identity-drift triage pattern without reusing drift semantics:

```text
open --acknowledge--> acknowledged
open --resolve------> resolved
acknowledged --resolve--> resolved
acknowledged --reopen--> open
resolved --reopen------> open
```

Invalid duplicate transitions are rejected.

`resolve` means:

> the operator has completed handling this evidence item.

It does **not** mean:

> the provider model is retired.

## Projection behavior

Unreviewed v0.15 absence events appear in the queue as implicit `open` items.

Once an operator records a decision, the durable review summary and append-only audit are joined back to the evidence item.

Current canonical Model / Candidate information remains navigation context only. It is queried from current catalog state and does not rewrite the historical presence event.

## What review actions never mutate

Presence review actions do not modify:

- `models`;
- `model_execution_bindings`;
- aliases or alias-resolution history;
- catalog discovery Candidates;
- catalog discovery observations;
- catalog promotion records;
- identity-drift reviews;
- immutable provider snapshots.

No lifecycle status is inferred or written.

## UI workflow

The review screen links to:

- provider Presence Timeline;
- Catalog Integrity;
- Provider Coverage;
- Identity Case when the remote ID currently resolves to a canonical Model;
- Catalog Inbox when a current Candidate exists.

Presence Timeline and Catalog Integrity both link into the review workflow.

## Invariants retained

1. Provider-list absence remains evidence, not retirement.
2. Only complete reconstructable v0.15 snapshots can originate reviewable absence events.
3. A review decision cannot manufacture identity drift or lifecycle state.
4. Review history is append-only.
5. Current review status is operational state, not catalog truth.
6. Raw provider response bodies remain outside normal API/Web projections.
7. Candidate reconciliation and promotion remain separate explicit workflows.
8. Canonical identity and execution routing remain source-backed.
9. Browser clients never receive the API control token.
10. v0.16 introduces no automated lifecycle action.
