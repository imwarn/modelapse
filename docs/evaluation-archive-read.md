# Evaluation and Archive Read API

## Automatic exact-text evaluation

A runnable Test must have a supported evaluator binding.

For `exact-text@1.0.0`, the runner compares the provider-normalized text with the immutable Test Case `metadata.expected` value without trimming or normalization.

The persisted Evaluation contains:

- evaluator id/version/definition hash;
- private content-addressed raw result;
- `exact_match`;
- expected text;
- actual normalized text.

The Run itself remains sealed and unchanged.

## Public Archive API

No control token is required for public Archive reads.

```text
GET /v1/archive/models
GET /v1/archive/tests
GET /v1/archive/runs
GET /v1/archive/runs/:runId
```

Run listing supports:

```text
?modelId=<uuid>
?testCaseId=<uuid>
?limit=1..100
```

Archive Run projections include canonical Model context, Provider, Test identity, execution path, best Evidence level, evaluator version, and deterministic exact-match result.

Private blob object keys and raw provider responses are not exposed.

## Control-plane behavior

`GET /v1/control/catalog/tests` only returns Test Cases whose Test Version has an evaluator supported by the current controlled runner.

This prevents the normal UI from offering a Model/Test combination that can execute but cannot complete the expected evaluation pipeline.
