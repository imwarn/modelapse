# Archive v0.18 — Provider Testability Registry / Access & Cost Evidence

Archive v0.18 adds the first execution-comparability foundation outside the catalog identity system.

The registry answers:

> Under what sourced provider-policy or runner-access conditions can Modelapse test this Provider or Model?

It is intentionally an **observation registry**, not a provider capability truth table.

## Why this exists

A sourced first-party endpoint is not enough to guarantee a fair comparison.

Two Runs may differ because of:

- signup / entitlement restrictions;
- execution region;
- billing mode;
- account tier;
- service tier;
- pricing and repetition budget;
- a documented provider variant;
- an uncertain runner environment.

v0.18 makes these conditions auditable before later releases bind them to individual Runs.

## Observation subjects

Each observation has one subject kind.

### provider_policy

Source-backed statements about a Provider or Model, for example:

- registration availability;
- billing requirement;
- regional restrictions;
- documented service tier;
- published pricing.

### runner_access

Non-secret facts about the Modelapse execution environment, for example:

- the controlled runner can currently access the provider;
- the account is a paid or named tier;
- a specific service tier is available;
- the environment is only known to be uncertain.

The registry must never contain API keys, passwords, account emails, identity-document data, or complete provider account identifiers.

## Append-only model

`provider_testability_observations` is append-only.

A newer observation does not rewrite an older observation.

The current matrix is a projection selecting the latest observation for:

```text
(provider, optional model, execution path, subject kind)
```

This lets Modelapse preserve policy and access changes over time.

## Core fields

Observations can capture:

- Provider;
- optional canonical Model;
- execution path;
- subject kind;
- access state;
- registration requirement;
- billing requirement;
- region policy;
- allowed / blocked region tags;
- non-secret account tier;
- service tier;
- service assurance;
- optional native-currency text pricing;
- first-party or operator-verification source;
- observed timestamp;
- actor and note.

## Service assurance

Allowed values:

- `documented_default`
- `documented_variant`
- `operator_uncertain`
- `unknown`

These describe the **execution environment**, not model quality.

`operator_uncertain` is the correct v0.18 representation for cases where an operator suspects that the service may not be representative but does not yet have calibration evidence.

v0.18 deliberately has no `degraded` status.

## Pricing

The initial pricing fields target the current direct text-test workload:

- currency;
- input price per one million tokens;
- output price per one million tokens;
- optional per-request price.

They are nullable because not every provider uses token pricing.

A pricing observation is scoped to the Provider and optional Model and is preserved with its source and observation time.

v0.18 does not calculate Run cost. That belongs to the later Cost Ledger phase.

## Region tags

Region tags are evidence labels, not geofencing logic.

Prefer ISO 3166-1 alpha-2 country codes when the provider policy is country-specific.

Broader jurisdiction tags may be recorded only when the cited source itself uses that grouping.

v0.18 does not automatically route workers by region.

## Source boundary

Every observation creates or references a `source_records` row.

Supported v0.18 source types are:

- `provider_docs`
- `provider_pricing`
- `provider_policy`
- `operator_verification`

Provider-policy/pricing/docs sources should use a URL.

`operator_verification` may be URL-less and is visibly weaker provenance.

The registry does not store raw webpage bodies.

## Operator API

Protected endpoints:

```text
GET  /v1/control/provider-testability
GET  /v1/control/provider-testability/:providerId
POST /v1/control/provider-testability/observations
```

The write endpoint is append-only.

## Web

Operator route:

```text
/provider-testability
```

The UI shows the latest Provider / Model observation matrix and allows an operator to append a new observation.

It also highlights:

- missing provider-policy evidence;
- missing runner-access evidence;
- restricted / unavailable access;
- uncertain service environment.

No risk score or readiness score is calculated.

## v0.18 boundary

v0.18 does **not**:

- automatically block a Run;
- automatically select credentials;
- choose a region;
- calculate per-Run cost;
- claim model degradation;
- mark a Run comparable / non-comparable;
- expose provider secrets;
- modify catalog identity.

Those are later stages in `docs/archive-roadmap.md`.

## Invariants

1. Testability observations are append-only.
2. Latest state is a projection, not mutable truth.
3. Provider-policy and runner-access evidence remain distinct.
4. Pricing observations are time-varying evidence.
5. Account context contains no secrets or personal identifiers.
6. `operator_uncertain` is an environment caveat, not a model-quality verdict.
7. Missing evidence remains unknown.
8. v0.18 does not auto-block execution.
