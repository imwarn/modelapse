# Provider Expansion Playbook

Archive v0.24 turns Provider onboarding into an evidence-gated process.

A new Provider Adapter is **not complete because one HTTP request succeeds**. Modelapse evaluates onboarding under a named, append-only Provider Expansion policy and exposes the missing evidence directly to operators.

## Status model

Provider readiness is categorical, not a percentage score:

- `incomplete` — one or more required evidence gates are missing;
- `limited` — required gates are complete, but a documented limitation remains;
- `ready` — all required gates are complete with no current limitation under the selected policy.

A Provider can therefore be fully documented yet still be `limited`, for example when model-version metadata is explicitly unsupported.

## provider-expansion-v1

The initial policy requires:

1. first-party identity provenance;
2. catalog collection evidence;
3. access / registration / region policy evidence;
4. sourced pricing evidence;
5. controlled runner account + fleet context;
6. at least one sealed E4/E5 first-party direct Run;
7. calibration coverage;
8. an explicit runtime capability contract.

The policy is stored in `provider_expansion_policies`. New rules require a new policy version; existing policy rows are append-only.

## Evidence gates

### Identity provenance

Every active/preview canonical Model must have:

- `canonical_source_id`;
- a current first-party direct execution binding;
- a source-backed Provider endpoint;
- a source-backed execution binding.

One sourced endpoint is not enough if another active Model lacks a sourced binding.

### Catalog collection

At least one enabled catalog observer source must have successful or partial snapshot evidence.

Model-list evidence is expected. If the Provider genuinely has no usable model-list surface, operators may explicitly declare `catalog_model_list=unsupported`; this is surfaced as a limitation rather than silently treated as coverage.

### Access and region evidence

Current `provider_policy` observations must cover the Provider or every active Model.

The gate requires:

- known access state;
- known region policy;
- source-backed observations.

Restricted or unavailable access remains evidence, but produces a limitation rather than being rewritten as “normal”.

### Pricing evidence

Pricing is complete only when current Provider-wide pricing exists or every active Model is covered by a current sourced pricing observation.

Zero is allowed when the sourced price is actually zero. Missing pricing is not interpreted as free.

### Runner account context

At least one current runner-access observation must identify:

- available access;
- account tier;
- documented service assurance.

At least one enabled Fleet environment for the Provider must also expose:

- region;
- account tier;
- documented service assurance;
- enabled first-party-direct capability.

Secrets and personal account identifiers are never part of the readiness payload.

### Verified direct execution

At least one sealed completed `first_party_direct` Run must carry E4 or E5 evidence.

This proves that the controlled execution path works, but it does not by itself prove representative service quality.

### Calibration

At least one calibration assessment must exist.

A pass satisfies coverage. An anomaly also satisfies “coverage exists” but remains a caveat. A repeated anomaly is surfaced more strongly; it is still not automatically described as intentional degradation.

### Capability contract

Every required runtime capability must be declared explicitly:

- `returned_model_metadata`;
- `model_version_metadata`;
- `provider_request_id`;
- `provider_response_id`;
- `service_tier_metadata`;
- `token_usage`.

Declarations are append-only `provider_capability_events`.

States are:

- `supported`;
- `unsupported`.

There is no implicit “probably supported”. Missing declarations are blockers.

For capabilities declared `supported`, readiness also requires at least one verified direct Run that actually demonstrates capture. A supported-but-never-observed claim remains incomplete.

An explicit `unsupported` declaration satisfies completeness but makes the Provider `limited`.

## Adapter descriptor contract

`ProviderAdapterDescriptor.capabilities` is exhaustive for runtime metadata capture.

Current examples:

- OpenAI declares service-tier metadata supported;
- DeepSeek declares service-tier metadata unsupported;
- Anthropic declares service-tier metadata unsupported;
- all three currently declare model-version metadata unsupported.

OpenAI and DeepSeek production bootstrap persist these manifests into the capability ledger only when no declaration exists yet. A later operator declaration remains authoritative in the current projection; bootstrap never overwrites it.

## Operator API

Authenticated control-plane endpoints:

```text
GET  /v1/control/provider-expansion
GET  /v1/control/provider-expansion/:providerId
GET  /v1/control/provider-expansion/policies
POST /v1/control/provider-expansion/capabilities
POST /v1/control/provider-expansion/policies
```

The Web operator view is available at:

```text
/provider-expansion
```

It exposes gates, blockers, limitations, evidence-reference counts, capability declarations and controlled Fleet context.

## Provider onboarding sequence

A practical onboarding order is:

```text
adapter descriptor + explicit capabilities
→ Provider / endpoint source
→ canonical Model + execution binding source
→ catalog observer source + snapshot
→ access / registration / region policy
→ pricing
→ runner-access observation
→ controlled Fleet environment
→ E4 first-party Run
→ calibration Run
→ Provider Expansion review
```

This order is operational guidance, not a historical rewrite rule.

## Invariants

1. Readiness is a derived view, never a mutation of Run/Evaluation history.
2. Provider credentials never appear in the readiness model.
3. Unsupported capabilities are explicit facts, not missing fields.
4. “Supported” requires observed capture before the capability gate passes.
5. A restricted Provider may be documented completely while remaining limited.
6. One successful request does not make a Provider ready.
7. Policy evolution adds new versions instead of rewriting old policy rows.
8. Readiness status is not a model-quality score.
