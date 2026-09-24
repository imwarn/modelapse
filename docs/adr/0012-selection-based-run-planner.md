# ADR 0012 — Normal Run submission is selection-based

Status: Accepted

## Decision

The normal Modelapse execution surface accepts catalog object identifiers:

```text
modelId
testCaseId
optional limited generation config
```

It does not ask an operator to type:

- provider slug;
- provider API model string;
- endpoint URL or hostname;
- runner kind;
- credential name;
- evidence level;
- prompt bytes.

A PostgreSQL-backed Run Planner resolves those values from the catalog and then enqueues the existing durable Run job.

## Product flow

```text
Add / select Model
        +
Add / select Test
        |
        v
Run Planner
        |
        +--> canonical model identity
        +--> current sourced execution binding
        +--> provider
        +--> API model id
        +--> current sourced first-party endpoint
        +--> active published Test Case
        |
        v
durable Run job
        |
        v
runner
        |
        v
Run + Evidence
```

The planner is the intended control surface for future UI and admin tooling.

## Model execution binding

Canonical Model identity and provider API execution identity are separate.

`models` stores the canonical archive entity.

`model_execution_bindings` stores the sourced, temporal mapping from a canonical model to a provider endpoint and API model identifier.

This avoids making a mutable provider alias the permanent Model identity.

A current binding may optionally identify a concrete Model Snapshot.

## Runner revalidation

Planning is not sufficient authority to execute.

The runner re-resolves the selected `modelId`, API model id, Test Case and provider endpoint immediately before provider execution.

If catalog state changed between planning and execution, the job fails closed rather than silently executing a different model.

## Legacy low-level endpoint

`POST /v1/control/run-jobs` remains available as an internal/advanced control endpoint during the transition.

The normal endpoint is:

```text
POST /v1/control/runs
```

Future product UI must use the selection-based endpoint.

## Security and error reduction

The change reduces operator-controlled execution fields without weakening the existing runner boundary.

Credentials remain runner-only and evidence level remains system-derived.
