# Public Comparability & Longitudinal Context — Archive v0.25

Archive v0.25 builds a **public, evidence-first** comparison surface on top of Archive v0.19–v0.24. It does not introduce aggregate model scores, rankings, or unsupported quality claims.

## Public comparison

`/compare` selects 2–4 canonical Models and an **exact public non-calibration Test Case**. The initial selection prefers Models from two different Providers, when present.

The public API `GET /v1/archive/compare?modelIds=…&testCaseId=…&policyVersion=…` already evaluates Runs under v0.23 versioned comparability policies. The UI now surfaces policy selection, so visitors can inspect the same immutable evidence under different **explicit policy versions**, without rewriting Run or Evaluation.

Beside each latest result the public UI shows:

- comparability outcome and machine-readable reasons;
- replication requirement and achieved count;
- same-context calibration status and anomaly streak;
- execution region and account tier;
- effective service tier and documented assurance;
- frozen execution qualification caveats;
- frozen cost-evidence caveats, including unavailable pricing or usage.

The comparison result may be `matched`, `mismatched`, or `unknown`. These describe whether the Runs are eligible to be compared *under the chosen policy*, not which model performs better.

A **cross-provider execution-context badge** checks execution path, region, account, effective service tier, and assurance. It intentionally excludes Provider-specific policy/runner observation IDs from equality checks. Those references are independent evidence and must not create false environment mismatches.

## Public longitudinal history

`GET /v1/archive/history?modelId=…&testCaseId=…&limit=…` now includes `contextTransitions`, aligned one-to-one with the returned `runs`, in capture-time order.

Each derived transition contains:

- `runId`, `previousRunId`;
- status: `baseline`, `unchanged`, `changed`, `evidence_changed`, or `unknown`;
- field-level changes with previous/current values and `execution` or `evidence` category;
- unresolved field names, instead of treating missing values as equal;
- the Run's frozen qualification/cost caveats.

Execution changes cover execution path, Fleet environment ID, region, account tier, service tier, effective returned service tier, and service assurance.

Evidence changes cover Provider policy observation ID, runner access observation ID, and Fleet capability declaration event ID. A new evidence observation can therefore appear as `evidence_changed` without implying the model or execution environment changed.

A missing value on either side is listed in `unknownFields`. Known execution differences take precedence over unknown fields; if only evidence changes are known but required execution/evidence fields are missing, status remains `unknown` with the evidence differences still visible.

The first returned Run is always `baseline`: there is no claim about Runs earlier than the selected window. History is bounded by the existing Archive limit (1–100), and the default temporal cross-model view uses the latest 20 Runs per Model.

## Non-causal interpretation

A model response changing between Runs **does not prove model degradation**. In particular:

- region, service tier, account, or assurance changes may explain why historical points are not directly comparable;
- an evidence-source refresh is not an execution-environment change;
- a single calibration anomaly cannot be reported as degradation;
- missing qualification remains unknown;
- historical Run, qualification, pricing, Evidence, and Evaluation stay immutable.

This phase is a presentation and derived-read extension. It adds no schema migration and does not change Planner, Queue, or Runner truth.

## Verification

- unit tests cover stable context, evidence-only changes, execution changes, missing context, and single-Run baseline;
- database integration checks a real pair of sealed Run qualification snapshots with a region change;
- public Archive API fixture covers history transitions;
- standard CI checks TypeScript, unit tests, migrations, persistence/runner integrations, and image builds.
