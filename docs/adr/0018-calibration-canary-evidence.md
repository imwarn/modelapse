# ADR 0018 — Calibration failures are append-only anomaly evidence

## Status

Accepted for Archive v0.22.

## Decision

1. Calibration is represented by immutable Test Cases with `case_type=calibration`.
2. Calibration Runs use the normal first-party execution, Evidence and Evaluation pipeline.
3. Calibration output is not a leaderboard score.
4. An assessment is written only after Evaluation and is append-only.
5. Streaks are scoped to the exact Provider/Model/execution-environment context.
6. One anomaly recommends repetition; repeated anomalies require the policy threshold.
7. A failed or repeated canary is evidence of an anomaly, not proof of service degradation or deliberate model degradation.
8. Later calibration evidence is not treated as if it existed before an earlier benchmark Run.

## Consequences

Service-health evidence becomes auditable and reusable by comparability policy without contaminating immutable Run facts or ranking surfaces.
