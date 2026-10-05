# ADR 0017 — Route Runs through immutable execution environment identities

## Status

Accepted for Archive v0.21.

## Context

Before v0.21, a Runner could record a deployment region, but the queue had no first-class concept of which controlled account/region environment should execute a planned Run.

That creates several problems:

- multiple regional workers can race for the same job;
- account-tier-specific access is an implicit deployment fact;
- disabling one deployment does not prevent another worker from claiming the job;
- a historical Run cannot name the exact controlled environment selected by the Planner;
- Provider capability and region restrictions remain operational convention rather than scheduling evidence.

Credentials must remain outside PostgreSQL and outside browser-visible control responses.

## Decision

1. Execution environment descriptors are immutable and contain only non-secret region/account/service context.
2. Environment enable/disable state is append-only.
3. Provider execution capabilities are append-only declarations with a deterministic selection priority.
4. The Planner, not the caller, selects one compatible environment and freezes the exact capability event into the durable job.
5. `run_jobs.target_execution_environment_id` is the routing key.
6. A worker claims only its own environment's jobs, and only while the current environment and Provider capability remain enabled.
7. The Runner verifies that its actual configured environment matches the frozen plan before Provider I/O.
8. The Run qualification envelope stores the environment ID and capability event ID; PostgreSQL validates the frozen descriptor/capability against the Run Provider/path.
9. Secrets remain deployment-local. The Fleet registry contains no credential values or personal provider account identifiers.
10. Legacy/unassigned scheduling is allowed only while the Fleet registry has never been configured. Once any environment exists, lack of a compatible environment is a planning error.

## Determinism

Candidate ordering is inspectable and stable:

1. capability selection priority;
2. exact service-tier preference;
3. exact account-tier preference;
4. environment slug;
5. environment UUID.

This is scheduling policy, not model ranking.

## Consequences

- region/account workers no longer race for unrelated jobs;
- operator disable events become effective scheduling controls;
- historical Runs can name the exact controlled environment and capability evidence used;
- queue delay does not rewrite the selected Fleet target;
- current capability state can stop execution without mutating the historical plan;
- credentials remain confined to Runner deployments;
- calibration/health interpretation remains out of scope until v0.22;
- formal comparability grouping remains out of scope until v0.23.
