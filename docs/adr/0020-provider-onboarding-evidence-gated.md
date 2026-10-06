# ADR 0020 — Provider onboarding is evidence-gated

## Status

Accepted for Archive v0.24.

## Context

A working HTTP request proves only that one request succeeded. It does not establish canonical identity, first-party provenance, access conditions, pricing, runner account context, response metadata coverage, service-health calibration or the limits of the Provider Adapter.

Treating transport success as onboarding completion would make later benchmark comparisons appear stronger than their evidence.

## Decision

1. Provider onboarding is evaluated under a named append-only Provider Expansion policy.
2. Readiness is derived from existing identity, catalog, testability, pricing, Fleet, Run and calibration evidence.
3. Readiness uses categorical `ready`, `limited`, and `incomplete` states; no percentage score is introduced.
4. Runtime Provider Adapter metadata capabilities are exhaustive and must be declared `supported` or `unsupported`.
5. A capability declared `supported` must be observed in verified first-party execution before its gate passes.
6. An explicit `unsupported` declaration satisfies documentation completeness but remains a visible limitation.
7. Provider capability declarations are append-only events; later declarations change only the current projection.
8. Production bootstrap may seed adapter manifests only when no current declaration exists and must never overwrite operator evidence.
9. Provider credentials and personal account identifiers are outside the readiness data model.
10. Readiness never mutates historical Runs, Evaluations, qualification envelopes or calibration assessments.

## Consequences

New Provider work now has an auditable definition of done. Provider-specific limitations remain visible instead of being normalized away, and v0.25+ public comparison surfaces can distinguish a Provider that is genuinely evidence-ready from one that merely has a functioning HTTP adapter.
