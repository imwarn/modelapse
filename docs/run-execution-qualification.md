# Archive v0.19 — Run Execution Qualification Envelope

Archive v0.19 freezes Provider/Runner testability evidence onto each Run so historical results are interpreted using the execution context that existed when the Run was planned and executed.

## Why this exists

Provider testability observations are time-varying. Reading the current Provider Testability Registry when viewing an old Run would silently reinterpret history.

v0.19 therefore carries the exact observation IDs selected by the Run Planner into the durable Run job and persists them with the Run before provider execution begins.

The worker adds the actual non-secret execution region from its own environment. Provider-returned service-tier metadata is captured separately at sealing time.

## Frozen planning envelope

`run_execution_qualification_envelopes` is one immutable row per Run and stores:

- planner selection timestamp;
- execution region reported by the controlled runner;
- exact provider-policy observation reference;
- exact runner-access observation reference;
- non-secret account tier;
- non-secret service-tier context;
- requested service tier;
- service assurance;
- explicit caveats.

The observation foreign keys point at append-only v0.18 evidence, so later registry observations cannot change the meaning of an older Run.

## Execution outcome

`run_execution_qualification_outcomes` is a separate append-only row because returned service metadata is not known when the Run is created.

It captures:

- returned service tier when the Provider exposes one;
- outcome caveats such as requested/returned tier mismatch;
- capture timestamp.

Keeping planning and outcome facts separate avoids mutating the original planning envelope.

## Execution region

The runner reads `MODELAPSE_EXECUTION_REGION`.

This must be a non-secret deployment label such as an ISO country code or an operator-defined region label. If it is absent, the Run is still executed, but the envelope carries `execution_region_unknown`.

v0.19 does not route workers by region. Regional fleet selection belongs to Archive v0.21.

## Qualification caveats

Caveats are factual flags, not quality judgements. Current flags include:

- `provider_policy_evidence_missing`
- `runner_access_evidence_missing`
- `provider_access_restricted`
- `provider_access_unavailable`
- `provider_access_unknown`
- `runner_access_restricted`
- `runner_access_unavailable`
- `runner_access_unknown`
- `service_assurance_operator_uncertain`
- `service_assurance_unknown`
- `execution_region_unknown`
- `testability_evidence_not_planned`
- `returned_service_tier_mismatch`
- `returned_service_tier_unknown`

None of these flags imply model degradation.

## Comparison context

Archive Run summaries expose a deterministic `contextKey` only when the execution context is sufficiently known:

- execution region is present;
- provider-policy and runner-access observation references are present;
- account tier is present;
- service tier is present;
- service assurance is documented rather than unknown/uncertain.

The comparison UI uses the first available Run as the reference and renders:

- `context matched` when known context keys are equal;
- `context mismatched` when known context keys differ;
- `context unknown` when either side lacks enough evidence.

This is a provenance aid only. It is not a winner/ranking signal.

## Boundaries

v0.19 does not:

- block execution based on qualification;
- select credentials;
- choose a worker region;
- calculate Run cost;
- infer service degradation;
- decide final comparability sets;
- rewrite old Runs when Provider Testability observations change.

Those remain staged in Archive v0.20–v0.23.

## Invariants

1. The exact v0.18 observation IDs selected by the planner survive queue delay.
2. The planning envelope is immutable.
3. Returned service-tier facts are append-only execution outcomes.
4. Missing evidence remains visible as unknown.
5. Execution-region data is non-secret deployment context.
6. Comparison context is descriptive, never evaluative.
7. Later Provider Testability updates cannot reinterpret an old Run.
