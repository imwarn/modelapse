# ADR 0015 — Freeze execution qualification per Run

## Status

Accepted for Archive v0.19.

## Context

Provider Testability Registry observations are append-only but time-varying. If an old Run reads only the current Provider/Runner testability projection, later registration policy, account-tier, region, or service-tier observations can silently reinterpret the conditions under which the historical result was produced.

The durable Run queue also introduces a planning/execution gap. The evidence selected by the planner must survive that gap without being replaced by whatever happens to be current when a worker eventually claims the job.

Returned service metadata is only known after the provider response, while planning evidence must already be frozen before provider execution begins.

## Decision

1. The Run Planner resolves the exact active `provider_policy` and `runner_access` observation IDs and embeds them in the durable job payload.
2. The worker adds its non-secret `MODELAPSE_EXECUTION_REGION` deployment label and creates an immutable `run_execution_qualification_envelopes` row in the same transaction as the Run.
3. The envelope is append-only and references the original v0.18 observations by foreign key.
4. Provider-returned service tier is stored separately in append-only `run_execution_qualification_outcomes` at seal time.
5. Direct job submission cannot supply qualification evidence; planner-owned evidence is accepted only through the internal durable payload.
6. Idempotency comparison ignores only `selectedAt`; evidence IDs, tier context, assurance, and caveats remain part of the idempotency identity.
7. Archive comparisons expose only `matched`, `mismatched`, or `unknown` execution context. They do not infer quality or a winner.

## Consequences

- Old Runs remain interpretable even after Provider Testability observations change.
- Queue delay does not rebind a planned Run to newer evidence.
- Missing region/account/tier evidence remains visibly unknown rather than guessed.
- Requested and returned service tier can be audited without mutating the planning snapshot.
- Region-aware scheduling is still out of scope until Archive v0.21.
- Formal comparability-set policy remains out of scope until Archive v0.23.
