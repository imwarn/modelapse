# Calibration & Service-Health Canaries

Archive v0.22 adds a provider-neutral calibration layer for detecting execution-environment anomalies without turning canaries into benchmark scores.

## Boundary

A calibration Test is a normal first-party Run with the same immutable request/response, Evidence and Evaluation pipeline as any other controlled Run.

Its purpose is different:

- detect abrupt service/environment behavior shifts;
- request repetition after a suspicious result;
- accumulate repeated anomaly evidence in one exact execution context;
- expose tier/routing/environment differences for later comparison qualification.

Calibration results are **not leaderboard scores**.

The language hierarchy remains:

```text
unexpected output
→ execution-environment caveat
→ repeated anomaly
→ calibration anomaly
→ possible service degradation
```

A single failed canary must never be presented as proof of degradation, throttling, censorship or deliberate quality reduction.

## Canonical calibration Test

The initial TestPack is:

```text
family: modelapse-service-health
variant: exact-text-canary
version: 1.0.0
case: service-health-exact
case type: calibration
leaderboardEligible: false
```

It asks the provider to return one stable exact string and uses `exact-text@1.0.0`.

Production bootstrap:

```bash
npm run bootstrap:service-calibration -w @modelapse/catalog-admin
```

## Append-only policy

`calibration_policies` is append-only and versioned.

The initial `calibration-v1` policy uses:

- observation window: 3;
- repeated anomaly threshold: 2 consecutive anomalies;
- nominal recency window: 24 hours.

Changing policy means adding a new policy version, never mutating the old one.

## Per-Run assessment

After the immutable Evaluation is stored, a calibration Run may receive one append-only `calibration_run_assessments` row.

The assessment records:

- policy version;
- pass / anomaly / unknown;
- exact-match observation;
- consecutive anomaly streak;
- whether the anomaly is repeated under that policy;
- whether repetition is recommended;
- explicit caveats.

The database verifies that the source Run is a sealed completed `calibration` Test Case and that any exact-match claim agrees with the immutable Evaluation.

## Execution-context scoping

An anomaly streak is computed only against prior calibration assessments with the same:

- Provider;
- canonical Model;
- calibration Test Case;
- execution path;
- Fleet environment;
- region;
- account tier;
- service tier;
- service assurance.

An anomaly from one account/region/tier must not silently contaminate another environment's service-health state.

## Time causality

Comparability evaluation only considers calibration Runs completed at or before the benchmark Run being evaluated.

A later canary cannot retroactively become evidence that an earlier benchmark request was unhealthy. A later policy can re-evaluate eligibility rules, but it cannot invent evidence that did not yet exist at Run time.

## Service-health projection

`calibration_service_health_current` exposes the latest assessment for each Model × environment × calibration Test context.

Public Archive reads can expose this evidence, but must retain factual language such as:

- pass;
- anomaly;
- repeated anomaly;
- repetition recommended;
- unknown.

Do not translate these mechanically into “healthy”, “degraded”, or “normal quality”.
