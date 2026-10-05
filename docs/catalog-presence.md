# Archive v0.15 — Catalog Snapshot Evolution / Presence Timeline

Archive v0.15 turns the point-in-time coverage matrix from v0.14 into a conservative temporal view.

The question is:

> Across evidence-backed first-party model-list snapshots, which remote IDs became observable, stopped being observable in a later complete snapshot, or became observable again?

The projection deliberately answers only that evidence question. It does **not** infer that a Model was retired, deprecated, invalidated, or replaced.

## Operator route and API

Web:

- `/catalog-presence/:providerId`

Protected API:

- `GET /v1/control/catalog/presence/:providerId`
- optional `runLimit=2..100`

The Web server continues to hold `MODELAPSE_CONTROL_TOKEN`; browser JavaScript only submits the separate operator token to the TanStack Start server function.

## Read model

`PgCatalogPresence` lives in `@modelapse/catalog-admin`.

It reads existing immutable / append-only facts:

- model-list observer sources;
- collection runs;
- immutable source snapshots;
- source records;
- alias-resolution observations emitted for known canonical bindings;
- discovery observations emitted for unmatched remote IDs;
- current Candidate and alias-resolution context for navigation.

No mutable presence ledger is added.

v0.15 requires no schema migration. The source/run and provenance lookup indexes from v0.9 and v0.14 already cover the read path.

## Complete projection rule

A retrieved model-list run can participate in set-difference derivation only when:

```text
projectedItemCount == itemCount
```

where `projectedItemCount` is the number of distinct remote IDs reconstructable from:

```text
alias_resolution_events
+
catalog_discovery_observations
```

for that exact immutable snapshot/run.

This is intentionally stricter than checking only the collection status.

A run may have a stored first-party response and still be excluded from presence diffs when downstream observation/parsing produced a projection gap.

Such a run remains visible in the timeline as:

```text
completeProjection = false
```

but it cannot manufacture absence.

## Comparison baseline

Within each model-list observer source, complete snapshots are ordered chronologically.

The first complete snapshot in the loaded history is a **baseline**. It does not emit appearance events merely because the projection window starts there.

For every later complete snapshot, v0.15 compares its remote-ID set to the previous complete snapshot.

### Appeared

`appeared_in_complete_snapshot`

The ID was not present in the previous complete snapshot and has not previously been observed in an earlier complete snapshot inside the loaded comparison history.

Interpretation:

```text
observed_in_complete_model_list_evidence
```

### Not observed

`not_observed_in_complete_snapshot`

The ID was present in the previous complete snapshot and is absent from the next complete snapshot.

Interpretation:

```text
not_observed_in_complete_model_list_evidence
```

This does not mean:

- retired;
- deprecated;
- deleted;
- invalid;
- unavailable for execution;
- intentionally removed by the provider.

### Reobserved

`reobserved_in_complete_snapshot`

The ID had previously been observed in a complete snapshot, then was not observed in a later complete snapshot, and is now present again.

Interpretation:

```text
observed_again_after_complete_snapshot_absence
```

## Incomplete snapshots and gaps

Incomplete projections remain evidence of retrieval, but they are excluded from set-difference transitions.

Example:

```text
complete A:  alpha, beta
complete B:  alpha, gamma
incomplete C: beta          # itemCount says more items existed
complete D:  alpha, beta, gamma
```

Derived facts:

- B: beta `not_observed`
- B: gamma `appeared`
- C: no absence/reappearance derivation
- D: beta `reobserved`

The incomplete snapshot is never used to claim that alpha or gamma disappeared.

## Current context

Presence events expose only a current navigation context:

- latest canonical Model resolved for that provider alias, when present;
- current Candidate state, when present.

This context is not rewritten into the historical event. The event remains a snapshot-to-snapshot evidence transition.

## Summary

The provider timeline reports factual counts only:

- registered model-list sources;
- evidence runs in the loaded window;
- complete projection runs;
- incomplete projection runs;
- appearance transitions;
- not-observed transitions;
- reappearance transitions;
- latest complete snapshot time.

There is no risk score, retirement confidence, inferred lifecycle state, or automated action.

## Invariants retained

1. Raw provider response bodies stay outside ordinary API/Web projections.
2. Snapshot retrieval and identity projection remain separate evidence layers.
3. Incomplete projection cannot create a disappearance claim.
4. First snapshot in a loaded comparison window is a baseline, not a mass “appearance” event.
5. Non-observation never mutates `models.status`, execution bindings, aliases, or Candidates.
6. Reappearance is evidence history, not proof of provider intent.
7. Candidate promotion/reconciliation remains explicit and audited.
8. Identity Case remains the canonical operator evidence history for a Model.
9. Browser clients never receive the API control credential.
10. Presence Timeline is a derived Archive projection, not a new identity authority.
