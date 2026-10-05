# Regional / Account Execution Fleet

Archive v0.21 turns region and account context into an explicit scheduling primitive instead of an ad-hoc Runner deployment detail.

## Execution environment identity

`execution_environments` stores only a non-secret immutable descriptor:

- stable slug;
- region / egress jurisdiction label;
- account tier;
- service tier, when the deployment is tier-specific;
- service assurance classification;
- operator actor/note.

It never stores:

- provider API keys;
- login email;
- passwords;
- billing identifiers;
- personal account identifiers;
- attestation private keys.

If a deployment's region/account/service identity changes, create a new environment descriptor. Do not rewrite the old one.

## Operational state and Provider capabilities

Environment state is append-only through `execution_environment_state_events`.

Provider capabilities are append-only through `execution_environment_capability_events`. A capability declares that one environment may execute one Provider on one execution path and includes a deterministic selection priority.

The current state/capability views are only scheduling projections over those immutable events. Historical events remain addressable.

Disabling either the environment or its Provider capability immediately prevents workers for that environment from claiming matching queued jobs.

## Deterministic Planner selection

The Run Planner owns environment selection. Browser/API callers cannot choose or forge the internal Fleet target.

For a selected Provider/Model, the Planner considers:

1. registered environments whose current state is enabled;
2. current enabled `first_party_direct` capability for that Provider;
3. Provider policy allowed/blocked region evidence when explicit region lists exist;
4. compatibility with a requested service tier;
5. capability `selection_priority`;
6. matching service/account context as deterministic tie-break preferences;
7. environment slug/id as stable final tie-breakers.

The selected job freezes:

- environment ID and slug;
- region;
- account/service tier;
- service assurance;
- exact capability event ID;
- selection timestamp;
- Fleet caveats.

A later state/capability event cannot rewrite that historical plan.

## Queue routing

`run_jobs.target_execution_environment_id` is the durable routing key.

A Fleet worker claims only jobs targeted at its configured environment. Claim SQL also requires the environment and matching Provider capability to still be enabled at claim time.

A worker in environment A cannot claim a job targeted at environment B.

The queue remains at-least-once. Fleet routing does not change provider-request delivery semantics.

## Runner verification

Queue-mode Runner deployments should set:

```text
MODELAPSE_EXECUTION_ENVIRONMENT=<registered-environment-slug>
```

At startup the Runner resolves that immutable descriptor and refuses to start when:

- the slug is unknown;
- the current environment state is disabled;
- legacy `MODELAPSE_EXECUTION_REGION` is also set and contradicts the registered region.

Before Provider I/O, a Fleet-planned Run verifies that the actual worker environment exactly matches the frozen environment ID/slug/region/account/service/assurance snapshot.

The Run qualification envelope then freezes:

- `execution_environment_id`;
- `execution_capability_event_id`;
- region;
- account tier;
- service tier;
- service assurance;
- the existing Provider policy / runner-access evidence.

The database verifies that the capability event belongs to the same environment, Provider, execution path, and was an enabled declaration.

## Operator API

All Fleet control is behind the normal control token.

```text
GET  /v1/control/execution-fleet
POST /v1/control/execution-fleet/environments
POST /v1/control/execution-fleet/environments/:environmentId/state
POST /v1/control/execution-fleet/environments/:environmentId/capabilities
```

Example environment registration:

```json
{
  "slug": "us-paid-standard",
  "region": "US",
  "accountTier": "paid-standard",
  "serviceTier": "default",
  "serviceAssurance": "documented_default",
  "actor": "operator"
}
```

Example Provider capability:

```json
{
  "providerId": "<provider-uuid>",
  "executionPath": "first_party_direct",
  "enabled": true,
  "selectionPriority": 10,
  "actor": "operator"
}
```

## Rollout compatibility

When the database has **never had an execution environment registered**, the Planner keeps the legacy/unassigned path and records `execution_fleet_unconfigured`.

Once at least one environment exists, Fleet scheduling is considered configured. If no enabled compatible environment is available for a Run, planning fails closed. Disabling the whole Fleet therefore cannot silently fall back to an unrelated legacy worker.

## Archive presentation

Public Run detail exposes the frozen environment slug and capability event reference alongside region/account/service context.

This is provenance, not a quality claim. Two environments producing different results do not by themselves prove degradation; v0.22 calibration evidence is intentionally separate.
