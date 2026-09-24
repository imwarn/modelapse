# ADR 0013 — Evaluations are derived append-only records

Status: Accepted

## Decision

A sealed Run and its Evidence remain the factual execution record.

Evaluation is a separate derived record bound to:

- one sealed Run;
- one immutable evaluator identity and version;
- the Test Version's immutable evaluator binding.

Evaluating a Run never mutates the Run, Evidence, original response blob, or attestation.

## Test evaluator binding

`test_version_evaluators` binds a Test Version to one evaluator.

The binding is append-only. A changed evaluator requires a new evaluator version and, for changed Test semantics, a new Test Version.

The first supported evaluator is:

```text
exact-text@1.0.0
kind: deterministic
definition sha256:
513621b96e389527409b735499aaa3f5c2d0d6bd438ffc752d3060fba066c7b5
```

## Automatic pipeline

For the normal selection-based flow:

```text
Model + Test selection
        |
        v
Run Planner
        |
        v
durable queue
        |
        v
provider runner
        |
        v
sealed Run + Evidence
        |
        v
deterministic Evaluation
        |
        v
job succeeded
```

The durable job is marked succeeded only after the supported deterministic Evaluation has been persisted.

If provider execution succeeds and Evaluation persistence fails, the sealed Run remains factual history and the job fails with the Run id attached.

## Archive reads

Public Archive endpoints project only public Test Cases and sealed Runs.

The Archive exposes Evaluation summaries such as `exactMatch`, but does not expose private raw response or Evaluation blobs.

## Evidence MIME

Provider adapters explicitly allow capture of the trusted HTTP `content-type` response header. This improves blob metadata only; it does not alter response bytes or evidence hashes.
