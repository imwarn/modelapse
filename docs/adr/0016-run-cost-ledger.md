# ADR 0016 — Freeze Pricing Evidence Before Deriving Run Cost

- Status: Accepted
- Date: 2026-10-05
- Archive milestone: v0.20

## Context

Provider prices are time-varying evidence. A completed Run also has provider-reported usage that is known only after execution.

Calculating historical cost from the newest price table would make old Runs change meaning whenever a Provider changes pricing. Recording only an estimated amount would lose the evidence needed to explain the calculation.

Budget-aware scheduling also needs cost information, but scheduling policy must not become part of evaluation truth.

## Decision

Modelapse records two append-only layers.

### Planning-time cost envelope

Every normal planned direct Run receives a `run_cost_envelopes` row. The row references one compatible Provider Testability pricing observation when available and copies its exact native-currency price fields.

A database trigger verifies provider/model/execution-path compatibility and exact equality with the source observation.

Missing pricing remains an explicit unknown envelope.

### Seal-time cost fact

A `run_cost_facts` row is created only for a sealed `completed` Run. It records normalized usage and a native-currency estimate derived from the already frozen envelope.

Partial price bases or missing required usage produce a null estimate plus caveats instead of a partial total presented as complete.

### Budget projections

Collection budgets are append-only policies. Spend/status are derived views over immutable Run cost facts.

Budget state may influence future collection cadence only.

## Consequences

- historical cost estimates do not drift when Provider prices change;
- an estimate can be traced to both source pricing evidence and actual Run usage;
- old Runs are not retroactively priced;
- unknown pricing/usage is visible rather than treated as zero;
- FX normalization is not canonical unless separately sourced;
- cost cannot change Run payloads, evidence, or Evaluation results;
- future schedulers have a stable accounting surface without owning historical truth.
