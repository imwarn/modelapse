# ADR 0019 — Comparability is a versioned derived policy decision

## Status

Accepted for Archive v0.23.

## Decision

1. Cross-Run eligibility is evaluated under an explicit append-only `comparability_policies` version.
2. Policies may require Evidence level, execution context, replication and calibration conditions.
3. Missing qualification evidence yields `unknown` unless a policy explicitly makes the observed condition disqualifying.
4. A repeated same-context calibration anomaly may exclude a Run when the selected policy says so.
5. Cross-model context mismatches prevent a matched comparability set.
6. Matched sets receive a deterministic grouping key; the key has no ranking semantics.
7. Calibration Tests are not leaderboard comparison Tests.
8. Re-evaluating old Runs under a new policy never mutates the old Runs, Evaluations, qualification envelopes or calibration assessments.

## Consequences

The Archive can explain why two Runs are or are not comparable without pretending that every first-party response is an equally representative benchmark point.
