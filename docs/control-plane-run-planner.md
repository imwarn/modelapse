# Run Planner

The Run Planner is the normal way to launch Modelapse tests.

## List runnable models

Authenticated control request:

```text
GET /v1/control/catalog/models
```

A model appears only when all of the following are true:

- Model status is `preview` or `active`;
- the Model has a canonical source;
- it has a current sourced execution binding;
- the binding points at a current sourced first-party direct endpoint;
- the provider is supported by the controlled runner.

The response exposes the canonical `modelId` plus display information. Operators should persist/select the `modelId`, not type the API model string.

## List runnable tests

```text
GET /v1/control/catalog/tests
```

A Test Case appears only when it is active, its Test Version is published, its active window includes the current time, and the current direct runner can consume its artifact type.

v0.1 exposes text Test Cases.

## Launch a Run

```text
POST /v1/control/runs
Authorization: Bearer <MODELAPSE_CONTROL_TOKEN>
Idempotency-Key: <client-generated-key>
Content-Type: application/json
```

Body:

```json
{
  "modelId": "<model-uuid>",
  "testCaseId": "<test-case-uuid>",
  "config": {
    "maxOutputTokens": 64,
    "reasoningEffort": "none"
  }
}
```

The caller must not provide provider, model API id, endpoint, credential, prompt or evidence level.

The planner derives the internal durable job payload from catalog state.

## Add the first DeepSeek model

The current production bootstrap command is:

```bash
node packages/catalog-admin/dist/src/cli.js bootstrap-deepseek-flash-model
```

It creates or verifies:

- canonical Model: `deepseek-flash`;
- canonical source provenance;
- a current first-party execution binding;
- API model id: `deepseek-flash`;
- temporal alias observation backed by the provider source.

The command is idempotent.

Future Admin UI should call the shared catalog domain operation instead of issuing direct SQL.

## Runner revalidation

The durable job carries the canonical `modelId` and the derived API model id.

Before network I/O, the runner verifies that:

- the Model is still runnable;
- it still belongs to the provider;
- the same sourced execution binding is still current;
- the Test Case is still active and published;
- the endpoint still matches the provider adapter allowlist.

A stale plan fails closed.
