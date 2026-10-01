# Catalog Discovery / Reconciliation

Archive v0.8 promotes unmatched first-party model IDs from collection-run diagnostics into an auditable discovery queue.

The discovery layer does **not** auto-create Models, rewrite execution bindings, or synthesize identity drift. It separates three facts:

1. a first-party source exposed a remote model ID;
2. Modelapse has or has not reconciled that ID to a canonical Model;
3. a source-backed execution identity observation changed over time.

Only (3) feeds the v0.6 drift engine.

## Data model

### `catalog_discovery_candidates`

One mutable summary row per `(provider, remote_model_id)`.

It keeps:

- first / last seen timestamps;
- first / last collection and source references;
- latest explicit provider snapshot ID when supplied by the source;
- observation count;
- current reconciliation state;
- optional resolved canonical Model.

Current states:

```text
discovered
matched
ignored
promotion_ready
```

The summary is an index over immutable history; it is not the audit log.

### `catalog_discovery_observations`

Append-only evidence that a candidate appeared in a specific first-party collection run.

Repeated model-list collections therefore answer both:

- “is this ID still present?”
- “how many independent retrievals have observed it?”

### `catalog_reconciliation_events`

Append-only operator decisions:

```text
match_existing
ignore
mark_promotion_ready
reopen
```

A `match_existing` decision must resolve to a Model owned by the same Provider. This is enforced both by the TypeScript repository and a PostgreSQL trigger.

Reclassification writes another event; prior decisions are never rewritten.

## Collector integration

For every parsed model list, v0.8 divides remote IDs into two sets:

```text
exact current first-party binding match
    -> v0.6 observeFirstPartyIdentity(...)
    -> alias / binding history and drift

not an exact current binding match
    -> Catalog Discovery Candidate
    -> append-only Discovery Observation
```

An unmatched ID can remain visible for many collections without becoming canonical identity.

Collection-run metadata still contains `unmatchedRemoteModelIds` for lightweight diagnostics, and now also records `discoveryCandidateIds` so the run can be joined directly to the durable discovery queue.

## Reconciliation semantics

### Match existing

Use when evidence supports that the remote ID belongs to an already-cataloged Model.

This records the reconciliation only. It does **not**:

- add or replace an execution binding;
- insert an alias-resolution event;
- close a previous binding;
- generate a v0.6 drift event.

Those operations require a source-backed identity observation with the normal v0.6 chronology and immutability rules.

### Ignore

Use for IDs that should remain observed evidence but are not useful as a Modelapse canonical Model candidate, for example non-chat utility endpoints or provider-internal artifacts.

Future collections continue to update first/last-seen evidence without erasing the ignore decision.

### Promotion ready

Marks a discovery as ready for a later explicit canonical registration workflow.

v0.8 deliberately stops before automatic promotion. Canonical Model creation still requires a deliberate registration step with sourced identity fields.

### Reopen

Returns any reconciled candidate to `discovered` while preserving every earlier decision event.

## Catalog adapter boundary

The HTTP / parsing behavior is now behind `CatalogSourceAdapter`.

Current adapters:

- `openai_models`: OpenAI-compatible JSON model-list parsing;
- `snapshot_only`: capture and hash the source without deriving model identities.

The Observer selects adapters by the source row's `parser` value. Provider/source scheduling remains data-driven in `catalog_observer_sources`.

This keeps scheduling, retrieval, parsing, discovery, reconciliation, and identity ingestion as separate layers so provider-specific parsing can expand without coupling to the drift engine.

## Operator CLI

List candidates:

```bash
npm run list:catalog-discoveries -w @modelapse/catalog-admin
```

Optional filters:

```text
MODELAPSE_PROVIDER_SLUG=deepseek
MODELAPSE_CATALOG_DISCOVERY_STATUS=discovered
```

Reconcile one candidate:

```bash
npm run reconcile:catalog-candidate -w @modelapse/catalog-admin
```

Required:

```text
DATABASE_URL=...
MODELAPSE_CATALOG_CANDIDATE_ID=<uuid>
MODELAPSE_RECONCILIATION_ACTION=match_existing|ignore|mark_promotion_ready|reopen
MODELAPSE_RECONCILIATION_ACTOR=<operator identity>
```

For `match_existing`:

```text
MODELAPSE_RESOLVED_MODEL_ID=<model uuid>
```

Optional:

```text
MODELAPSE_RECONCILIATION_NOTE=...
```

Operator identity is stored as audit data. Do not put secrets in the actor or note fields.

## Promotion remains explicit

A `promotion_ready` candidate is evidence for the next workflow, not a Model.

A later promotion layer should require an explicit canonical slug, marketing name, status/family/track decisions, source selection, and first-party execution binding before the candidate can become a canonical Model.
