# Replication Policy & Comparability Sets

Archive v0.23 makes comparison eligibility a versioned, inspectable derived decision rather than an implicit UI assumption.

## Separation from historical facts

A comparability policy never mutates:

- Run request/response bytes;
- Evidence;
- execution qualification;
- Evaluation;
- calibration assessment;
- cost facts.

It answers one narrower question:

> Under this named policy version, may these immutable Runs be grouped as a comparable set?

The same historical Runs may be evaluated under a later policy version and receive a different eligibility result. The policy version must therefore always be visible.

## Initial policy

`comparability-v1` requires by default:

- Evidence level E4 or higher;
- same execution path across the set;
- recorded region;
- recorded account tier;
- recorded service tier;
- documented service assurance;
- no unresolved execution-qualification caveats;
- one repeat for ordinary Tests;
- three repeats for Tests marked `metadata.unstable=true`;
- a Test may override replication with `metadata.comparabilityMinRepeats`;
- recent calibration is not mandatory by default;
- if a recent same-context calibration exists, a repeated calibration anomaly makes the Run ineligible.

The default does **not** require every Provider to have calibration coverage immediately. Missing calibration can become mandatory in a future policy version without rewriting existing evidence.

## Per-Run result

A Run is derived as:

- `eligible`;
- `ineligible`;
- `unknown`.

Reasons are machine-readable and inspectable, for example:

- `evidence_below_policy_minimum`;
- `execution_region_missing`;
- `service_assurance_not_documented`;
- `execution_qualification_has_caveats`;
- `insufficient_replication`;
- `recent_calibration_missing`;
- `calibration_anomaly_needs_replication`;
- `repeated_calibration_anomaly`.

`unknown` is deliberate. Missing evidence must not be guessed into eligibility or ineligibility.

## Set-level result

A cross-model set is:

- `matched`;
- `mismatched`;
- `unknown`.

A matched set receives a deterministic SHA-256 key derived from:

- policy version;
- exact Test Case;
- execution path;
- region;
- account tier;
- effective service tier;
- service assurance.

The key is a grouping identity, not a score.

Set-level mismatches include:

- execution path mismatch;
- region mismatch;
- account tier mismatch;
- service tier mismatch;
- service assurance mismatch;
- any Run ineligible under policy.

## Calibration Tests

Calibration Tests are visible Archive facts but are excluded from the normal public comparison picker and are explicitly marked `calibration_test_not_leaderboard` if passed to the comparison API.

This prevents service-health probes from becoming accidental benchmark rows.

## Replication

Replication counts only sealed completed Runs of the exact same:

- Model;
- Test Case;
- execution path;
- environment;
- region;
- account tier;
- service tier;
- service assurance.

Cheap Providers therefore cannot satisfy another environment's repetition requirement, and a tier migration begins a new comparability context.

## Policy evolution

`comparability_policies` is append-only.

Operators can add stricter or looser versions while preserving the policy that produced an older public comparison. API callers may select a specific policy version.

Policy changes are interpretation changes, not historical fact changes.
