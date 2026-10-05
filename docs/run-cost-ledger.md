# Run Cost Ledger

Archive v0.20 makes collection cost an auditable part of each completed Run without turning cost into evaluation truth.

## Evidence model

The cost chain is deliberately split into two append-only records.

1. `run_cost_envelopes` is created with the Run. It freezes the pricing observation selected by the Planner, the exact native-currency price fields from that observation, the selection timestamp, and caveats.
2. `run_cost_facts` is created only when a Run seals as `completed`. It freezes normalized provider usage, a single-request quantity, the native currency, the estimate derived from the frozen price basis, and calculation caveats.

The database validates that a referenced `provider_testability_observations` row belongs to the same provider/model/execution path and that the copied price fields exactly match the source observation. A caller cannot attach an arbitrary price to a Run.

Later Provider Testability observations never reinterpret an older Run.

## Planner selection

The normal `POST /v1/control/runs` path owns pricing selection. It considers sourced first-party pricing observations for the selected Provider/Model and prefers:

- model-scoped evidence over provider-wide evidence;
- a matching service tier over generic pricing;
- a matching account tier over generic pricing;
- the newest compatible observation.

The durable job carries the selected observation ID and exact decimal price snapshot. Raw `/v1/control/run-jobs` callers cannot inject either the execution qualification envelope or the cost envelope.

If no compatible pricing evidence exists, planning remains possible but the Run carries `pricing_evidence_missing`. Missing cost evidence is not silently converted to zero.

## Cost calculation

The seal path uses only normalized usage returned by the Provider Adapter.

Supported bases are conservative:

- request-only pricing: `perRequest`;
- token pricing: both input and output price-per-million values plus corresponding usage;
- token pricing plus a per-request component.

If the frozen basis is partial, required usage is missing, or pricing evidence is absent, `estimated_native_cost` stays null and a caveat is recorded.

The canonical amount remains in the provider's native billing currency. Modelapse does not persist an unsourced FX conversion. A reporting layer may derive a normalized currency only when it also supplies independently sourced, time-bound FX evidence.

## Archive surface

Public sealed Run detail exposes:

- pricing selection time;
- pricing observation/source reference;
- frozen input/output/per-request rates;
- actual token/request quantities;
- native-currency estimate;
- explicit caveats.

Legacy Runs created before v0.20 have `cost: null`; they are not backfilled from current prices.

## Budget-aware collection

`collection_cost_daily` is a derived daily ledger by Provider and native currency.

`collection_budget_policies` is append-only. Policies can be global or Provider-scoped and use day/month periods. `collection_budget_status` derives current-period estimated spend, unknown-cost Run count, and remaining budget.

Operator endpoints:

```text
GET  /v1/control/cost-ledger/daily?days=30
GET  /v1/control/cost-ledger/budgets
POST /v1/control/cost-ledger/budgets
```

Budget state is scheduling input only. It never mutates a historical Run, changes an Evaluation, or rewrites Archive evidence.

## Scheduler contract

v0.20 provides the accounting and policy projections a scheduler can consume. A scheduler may reduce or defer repetitions when a budget is exhausted, but any Run that already exists remains immutable.

Unknown cost must remain visible to the scheduler. It must not be treated as free.
