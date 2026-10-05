# Archive v0.17 — Catalog Remote ID Case / Evidence Timeline

Archive v0.17 adds a read-only evidence case for one provider-scoped remote model ID.

The key is:

```text
(provider, remoteModelId)
```

This is intentionally different from the canonical Model-scoped Identity Case introduced in v0.12.

The Remote ID Case answers:

> What has Modelapse actually observed and decided about this exact provider model identifier over time?

It combines the evidence that previously lived across Coverage, Presence Timeline, Catalog Inbox, Promotion, and Presence Review into one chronological projection.

It does not create a new identity authority.

## Operator route and API

Web:

- `/catalog-remote-case/:providerId?remoteModelId=...`

Protected API:

- `GET /v1/control/catalog/remote-cases/:providerId?remoteModelId=...`

The query-string form is deliberate: provider model IDs may contain punctuation that should not become additional URL path segments.

The browser submits only `MODELAPSE_WEB_OPERATOR_TOKEN` to the TanStack Start server function. `MODELAPSE_CONTROL_TOKEN` remains server-side.

## Read model

`PgCatalogRemoteIdCase` lives in `@modelapse/catalog-admin`.

It reads existing durable facts only:

- `catalog_discovery_candidates`
- `catalog_discovery_observations`
- `catalog_reconciliation_events`
- `catalog_promotion_events`
- `model_aliases`
- `alias_resolution_events`
- `catalog_collection_runs`
- `catalog_source_snapshots` only indirectly through the existing presence projection
- `catalog_presence_reviews`
- `catalog_presence_review_events`
- current canonical Model context

No Remote ID Case table is added.

Migration `0017_catalog_remote_id_case_indexes.sql` adds only the composite read index:

```text
catalog_presence_reviews(provider_id, remote_model_id, occurred_at DESC)
```

## Two observation phases

A remote model ID may exist in two different evidence phases.

### Discovery observation

Before canonical reconciliation, unmatched model-list evidence is recorded as:

```text
catalog_discovery_observations
```

These appear in the Case as:

```text
discovery_observation
```

### Canonical observation

Once the same remote ID is represented by a canonical alias, later source-backed observations are recorded as:

```text
alias_resolution_events
```

These appear in the Case as:

```text
canonical_observation
```

The Case does not collapse these histories. It preserves the transition from “unmatched remote evidence” to “canonical identity observation”.

## Timeline kinds

The merged timeline can contain:

- `discovery_observation`
- `canonical_observation`
- `presence_appeared`
- `presence_not_observed`
- `presence_reobserved`
- `reconciliation`
- `promotion`
- `presence_review`

Every item is a projection of an existing observation, decision, promotion audit, or review audit.

There is no AI-generated summary event and no inferred lifecycle transition.

## Presence evidence

Presence transitions reuse the conservative v0.15 projection.

Only complete reconstructable model-list snapshots can create:

- appeared;
- not observed;
- reobserved.

Remote ID Case asks the v0.15 projection for up to the most recent 100 evidence-backed runs per model-list observer source.

Direct discovery / alias observations and durable review audit are not limited by that comparison window.

When an old absence event has aged outside the v0.15 comparison window but already has a durable v0.16 review record, the Case keeps a durable `presence_not_observed` anchor from the stored review evidence. That preserves operator audit without re-parsing raw provider payloads.

## Candidate and promotion history

If a Candidate exists for the remote ID, the Case exposes its current workflow state plus all append-only reconciliation decisions.

A promotion event contributes:

- promoted Model ID;
- actor;
- timestamp;
- policy version;
- immutable first-party source record.

Promotion is displayed as history. The Remote ID Case cannot execute promotion or reconciliation.

## Current canonical context

The Case may show a current canonical Model.

The current context is selected from:

1. the latest source-backed alias observation when present;
2. otherwise the Candidate resolved Model;
3. otherwise a promotion-created Model.

This is navigation context, not a rewriting of historical observations.

Operators can continue into the canonical Model-scoped Identity Case for the Model-level identity and drift history.

## Presence Review history

Every durable v0.16 review for the remote ID is shown with:

- presence event ID;
- evidence run;
- previous complete run;
- current review state;
- acknowledge / resolve timestamps;
- append-only operator decisions.

A resolved presence review still means only:

> the evidence item has been handled.

It does not mean:

- retired;
- deprecated;
- deleted;
- unavailable;
- invalid.

## Navigation

Remote ID Case is linked from:

- Provider Coverage rows;
- current bindings-not-observed rows;
- Presence Timeline events;
- Presence Review items;
- Catalog Inbox Candidate review.

From the Case, operators can navigate back to:

- Provider Coverage;
- Presence Timeline;
- Presence Review;
- Catalog Inbox;
- canonical Identity Case when one exists.

## Evidence privacy

The Case exposes source metadata such as:

- source type;
- first-party URL/title;
- retrieval timestamp;
- content SHA-256.

It does **not** expose:

- `catalog_source_snapshots.response_body`;
- collection error internals;
- `alias_resolution_events.raw_observation`;
- arbitrary provider response payloads.

## Summary semantics

The Case summary contains factual counts only:

- observation events;
- presence transitions;
- Candidate reconciliation events;
- presence-review decisions;
- current review-state counts;
- first / last observed timestamps.

These are not confidence, risk, severity, lifecycle, or priority scores.

## Invariants retained

1. Remote ID Case is a projection, not mutable catalog truth.
2. Provider-list absence does not imply retirement.
3. Candidate reconciliation and promotion remain explicit write workflows.
4. Presence Review remains operational triage only.
5. Canonical identity remains source-backed.
6. Discovery and alias observations remain append-only evidence.
7. Promotion and review history remains append-only.
8. Raw provider payloads remain outside normal API/Web projections.
9. Browser clients never receive the API control token.
10. Case reads never mutate Models, Candidates, bindings, aliases, snapshots, decisions, promotions, or reviews.
