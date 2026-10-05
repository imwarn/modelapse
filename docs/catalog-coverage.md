# Archive v0.14 — Provider Catalog Coverage / Reconciliation Matrix

Archive v0.14 extends the v0.13 Catalog Integrity entry point with a provider-scoped, read-only coverage projection.

The question is:

> For the latest evidence-backed first-party model-list snapshots, which remote IDs are already represented by canonical identity observations, which remain in the Candidate workflow, and which current first-party bindings were not observed?

The projection does not decide what any gap means. In particular:

- an unobserved current binding is **not** automatically retired;
- a remote ID in a provider catalog is **not** automatically promoted;
- an ignored Candidate remains historical evidence rather than disappearing;
- a partial parser/mapping failure is reported as an unprojected count rather than guessed back into identity.

## Operator routes and API

Web:

- `/catalog-coverage`
- `/catalog-coverage/:providerId`

Protected API:

- `GET /v1/control/catalog/coverage`
- `GET /v1/control/catalog/coverage/:providerId`

As with v0.13, the browser submits only `MODELAPSE_WEB_OPERATOR_TOKEN` to the TanStack Start server function. The API control token remains server-side.

## Read model

`PgCatalogCoverage` lives in `@modelapse/catalog-admin`.

It uses existing facts only:

- `catalog_observer_sources`
- `catalog_collection_runs`
- `catalog_source_snapshots`
- `source_records`
- `alias_resolution_events`
- `catalog_discovery_observations`
- `catalog_discovery_candidates`
- current sourced `first_party_direct` execution bindings

v0.14 does not add a mutable coverage table.

Migration `0015_catalog_coverage_indexes.sql` adds query-only indexes for:

- source-record → immutable catalog snapshot lookup;
- collection-run → discovery observation lookup;
- source-record → alias-resolution observation lookup.

## Reconstructing a model-list snapshot without exposing raw body

The raw provider response remains stored only in `catalog_source_snapshots.response_body`.

Coverage reconstructs the observable remote-ID matrix from facts emitted from the same immutable source snapshot:

```text
catalog snapshot / source record
       |
       +--> alias_resolution_events
       |      -> known binding was observed
       |
       +--> catalog_discovery_observations
              -> unmatched remote ID was observed
```

This means normal API/Web projections never need to return or parse the stored raw body.

For each model-list observer source, v0.14 selects the latest evidence-backed run that:

- has an immutable snapshot;
- has an item count;
- finished as `succeeded` or `partial`.

A newer failed/skipped attempt remains visible as the latest attempt, but it does not replace the last usable evidence snapshot.

## Remote-ID dispositions

Each reconstructable remote ID receives one explicit current workflow disposition:

- `canonical_observed`
- `candidate_discovered`
- `candidate_promotion_ready`
- `candidate_ignored`
- `candidate_matched`

These labels describe durable observations plus current Candidate state. They are not confidence or risk scores.

If the same latest snapshot item was known to the collector but an identity observation failed before an alias/discovery fact could be emitted, v0.14 does not inspect the raw body to recover it. The source reports:

- `itemCount`
- `projectedItemCount`
- `unprojectedItemCount`

That preserves the failure boundary established in v0.7: successful retrieval remains immutable evidence even when downstream mapping is partial.

## Current bindings not observed

When at least one usable latest model-list evidence snapshot exists, v0.14 compares current sourced `first_party_direct` API model IDs with the reconstructable remote-ID set.

A missing current binding is emitted with:

```text
interpretation = not_observed_in_latest_model_list_evidence
```

This is deliberately weaker than:

```text
retired
removed
invalid
deprecated
```

No retirement or binding rewrite happens automatically.

If a provider has no usable model-list evidence at all, v0.14 does not manufacture "not observed" rows. The provider instead reports zero evidence-backed sources.

## Summary counts

Provider summaries contain factual counts only:

- registered model-list sources;
- sources with usable evidence;
- source item count;
- unique reconstructable remote IDs;
- canonical observations;
- Candidate states;
- unprojected source items;
- current bindings not observed.

There is no aggregate integrity score, confidence percentage, risk score, or automatic priority.

## Workflow links

Coverage remains a navigation/projection layer:

- Candidate rows link to `/catalog-inbox`;
- canonical rows link to `/identity-cases/:modelId`;
- the overview links back to `/catalog-integrity`;
- drift remains handled by `/identity-review`.

## Invariants retained

1. Catalog snapshots are immutable evidence.
2. Raw provider response bodies stay outside ordinary API/Web projections.
3. Remote IDs do not create canonical Models automatically.
4. Candidate reconciliation/promotion remains explicit and audited.
5. Missing provider-list membership does not imply retirement.
6. Operator notes/actors remain in their existing control-plane audit projections.
7. Coverage reads do not mutate observations, Candidates, bindings, promotions, or reviews.
8. No network I/O occurs while database coordination locks are held.
9. The browser never receives the API control token.
10. Coverage is a projection, not a second identity authority.
