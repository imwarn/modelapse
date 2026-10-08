# ADR 0021 — Keep public comparability distinct from context changes

## Status

Accepted for Archive v0.25.

## Context

Archive v0.23 provided policy-based eligibility, but public comparison and history surfaces could still confuse the separate questions: “were Runs executed in compatible contexts?” and “did the sourced observations or execution environment change over time?”

Existing history badges displayed only whether a context key existed. That key included Provider-specific evidence IDs and therefore was inappropriate for direct cross-provider equality checks.

## Decision

1. Public comparisons select a named, append-only comparability policy version and show its eligibility reasons beside results.
2. No aggregate winner or quality score is added.
3. Cross-provider context equality compares execution characteristics, not provider-specific evidence IDs.
4. Longitudinal histories expose derived, field-level transitions between frozen Run qualification snapshots.
5. Execution field changes and evidence-reference changes are classified separately.
6. Unknown/missing fields remain visibly unknown; two missing values are never treated as proof of equality.
7. The first Run in a bounded history window is marked baseline.
8. Context transition caveats reuse frozen qualification and cost evidence.
9. Changes are descriptive records; they do not establish a causal explanation for output changes.
10. No historical Run, Evaluation, calibration or pricing evidence is mutated.

## Consequences

The public Archive can explain why a later result should not automatically be compared to an earlier result without equating provider-specific evidence refreshes with execution changes, or mistaking execution changes for model degradation.
