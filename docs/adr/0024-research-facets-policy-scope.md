# ADR 0024 — Research facet counts and policy assessments have explicit scopes

## Status

Accepted for Archive v0.28.

## Context

A limited UI page is not a valid basis for reporting whole-archive facet frequencies. Equally, a saved research selection cannot acquire a collective comparability verdict by applying per-Run eligibility rules; matched sets require same Test and matched contexts.

## Decision

1. Expose database-aggregated facets computed over the complete filtered eligible public research population, independent of pagination.
2. Count historical sealed non-calibration **Runs**, not Models or unique Tests; make this unit visible.
3. Type facet keys and response records; cap displayed values and report truncation rather than silently omit the remainder.
4. Represent missing context as null/unknown and maintain existing E4+ and cost availability semantics.
5. Evaluate saved collections' immutable Run memberships with a specifically selected append-only Comparability Policy version.
6. Reuse the existing per-Run evaluator and its historical replication/calibration rules; do not reinvent partial eligibility logic in the Web UI.
7. Label assessment `per_run_only_not_cross_provider_match`; no collective eligibility, winner or numeric ranking is inferred.
8. Keep derived policy assessments separate from collection selection digests and sourced JSON/CSV snapshots.
9. Do not allow paginated cursors to distort facet count scope.
10. Do not mutate original Run, Evaluation, qualification, calibration or research-collection records.

## Consequences

Research filters become explainable and auditable without conflating collection size with quality, while published snapshots can be reinterpreted under explicit policy versions without rewriting historical evidence.
