# Archive roadmap — execution comparability revision

This roadmap extends the original Modelapse Archive direction with a second provenance axis:

```text
What was tested?
  +
Under what provider access / account / region / service conditions was it tested?
```

The existing Archive already treats a Run as an immutable historical fact and keeps catalog identity, evidence, artifacts, evaluation, and operator review separate.

That is necessary but not sufficient for cross-provider comparison.

A first-party response can still be a poor comparison sample when:

- signup is unavailable in the operator's jurisdiction;
- an API or product is region-restricted;
- a provider exposes different account or service tiers;
- an account is rate-limited, capacity-limited, trial-only, or otherwise non-standard;
- a model is reachable only through a product surface while another is reachable by direct API;
- pricing makes equal-frequency repetition impractical;
- a returned service tier differs from the requested tier;
- a provider changes policy, capacity, routing, or entitlement over time;
- output appears anomalous but there is not enough evidence to distinguish model behavior from execution-environment degradation.

Modelapse must therefore archive **execution context and uncertainty**, not silently turn every successful provider request into an equally comparable benchmark point.

## Product rule

The comparison stack becomes:

```text
Artifact
  > Time
  > Evidence
  > Execution qualification
  > Evaluation
  > Score
```

"Execution qualification" does not mean Modelapse declares that a model is healthy, degraded, censored, throttled, or representative.

It means Modelapse records the observable conditions needed to judge whether two Runs were executed under sufficiently similar and documented circumstances.

## Evidence classes remain separate

The following concepts must not be collapsed into one field.

### Catalog identity evidence

Why Modelapse says a provider alias, endpoint, binding, snapshot, or remote ID corresponds to a canonical Model.

### Provider testability evidence

What provider policy and current runner access conditions say about whether that provider/model can be tested, in which regions or account tiers, and at what documented price basis.

### Run execution evidence

What happened during one exact request/response exchange.

### Execution qualification

Whether a Run has enough surrounding access/account/region/service evidence to be used in a particular comparison set.

### Evaluation

What a versioned evaluator derives from the immutable Run.

A high evidence level does not automatically imply high comparability. A direct E4 Run can still have an unknown account tier or uncertain service environment.

## Provider testability dimensions

Every provider integration should eventually be able to answer these dimensions without storing account secrets.

### Access

- available;
- restricted;
- unavailable;
- unknown.

### Registration requirement

- open signup;
- restricted signup;
- invite only;
- enterprise only;
- unknown.

### Billing requirement

- free;
- paid account;
- prepaid credit;
- subscription;
- enterprise contract;
- unknown.

### Region policy

- unrestricted;
- restricted;
- unknown;
- explicit allowed / blocked jurisdiction tags when evidence exists.

### Runner account context

Record non-secret execution context such as:

- account tier;
- service tier;
- region / egress jurisdiction;
- whether the environment matches a documented default or variant;
- whether the operator can only classify the environment as uncertain.

Never store:

- login email;
- password;
- API secret;
- billing account number;
- personal identity documents;
- full provider account identifiers.

### Pricing

Pricing is evidence, not a permanent provider attribute.

It can change by:

- Model;
- input/output direction;
- cache state;
- service tier;
- batch/realtime path;
- date;
- currency.

The Archive should keep sourced pricing observations over time rather than overwrite one "current price" column.

### Service assurance

Do not write "degraded model" because one Run looks bad.

Allowed execution-environment states should be factual or explicitly uncertain:

- documented default;
- documented variant;
- operator uncertain;
- unknown.

A quality-degradation claim requires later calibration/repetition evidence.

## Revised Archive sequence

### Archive v0.1–v0.17 — completed foundation

The completed foundation covers:

- immutable Runs and evidence;
- Run / Model / Test detail;
- temporal history and comparison;
- sourced identity and drift;
- scheduled first-party catalog collection;
- discovery / reconciliation / atomic promotion;
- drift review;
- Identity Case;
- integrity dashboard;
- provider catalog coverage;
- presence timeline;
- presence review;
- Remote ID Case / evidence timeline.

These remain authoritative historical layers.

### Archive v0.18 — Provider Testability Registry / Access & Cost Evidence

**Implemented:** see `docs/provider-testability.md`.

Introduce an append-only, source-backed observation layer for:

- provider-policy access;
- runner-account access;
- registration and billing requirements;
- region restrictions;
- non-secret account/service tier;
- documented text pricing basis;
- service-environment assurance.

Expose a control-plane matrix so operators can see where testability evidence is missing or uncertain before expanding test coverage.

v0.18 must not automatically block Runs or infer model quality.

### Archive v0.19 — Run Execution Qualification Envelope

**Implemented:** see `docs/run-execution-qualification.md` and ADR 0015.

Bind a Run to the exact testability observations active at planning/execution time.

Capture:

- execution region;
- account/service tier context;
- requested vs returned service tier;
- entitlement / access evidence references;
- explicit qualification caveats.

Comparison views should be able to distinguish:

- context-matched Runs;
- context-mismatched Runs;
- context-unknown Runs.

Still no winner/ranking inference.

### Archive v0.20 — Cost Ledger / Budget-Aware Collection

**Implemented:** see `docs/run-cost-ledger.md` and ADR 0016.

Add immutable cost facts for completed Runs:

- token/request quantities;
- pricing observation used;
- native-currency estimate;
- optional normalized reporting currency as a derived view;
- collection budget accounting.

The pricing observation reference should be frozen against the Run using the same append-only evidence pattern as ADR 0015, so a later price change cannot reinterpret an older cost estimate.

Schedulers may then choose repetition cadence based on budget policy, but cost must never change the historical Run payload or evaluation.

### Archive v0.21 — Regional / Account Fleet

**Implemented:** see `docs/regional-account-fleet.md` and ADR 0017.

Support multiple controlled execution environments without exposing credentials:

- region-specific workers;
- account-tier-specific workers;
- provider-specific capability declarations;
- deterministic worker selection;
- no browser-visible provider secrets.

This makes registration and region restrictions an explicit scheduling concern rather than an ad-hoc deployment detail.

### Archive v0.22 — Calibration & Service-Health Canaries

**Implemented:** see `docs/calibration-service-health.md` and ADR 0018.

Introduce stable calibration Tests that are not used as leaderboard scores.

Purpose:

- detect abrupt behavior shifts;
- distinguish probable service/environment anomalies from ordinary model variance;
- identify tier/routing differences;
- determine when a suspicious Run needs repetition.

One failed canary is evidence of an anomaly, not proof of deliberate degradation.

### Archive v0.23 — Replication Policy / Comparability Sets

**Implemented:** see `docs/comparability-policy.md` and ADR 0019.

Formalize when Runs can be grouped for longitudinal or cross-provider comparison.

Possible requirements:

- same exact Test Version / Case;
- compatible execution path;
- compatible service/account tier;
- documented region context;
- no unresolved execution-environment caveat;
- minimum repeat count for unstable Tests.

The grouping policy must be versioned and inspectable.

### Archive v0.24 — Provider Expansion Playbook

**Implemented:** see `docs/provider-expansion-playbook.md` and ADR 0020.

New Provider Adapters should not be considered complete merely because the HTTP request works.

Provider onboarding should require:

- first-party identity provenance;
- endpoint and model-list collection;
- access/registration/region evidence;
- cost evidence;
- runner account context;
- returned model/service metadata capture where available;
- calibration coverage;
- explicit unsupported capabilities.

### Archive v0.25 — Public comparability and longitudinal context

**Implemented:** see `docs/public-comparability-longitudinal.md` and ADR 0021.

With the access/cost/qualification layers in place, the public cross-provider comparison now exposes policy-version selection, latest Run eligibility, replication, calibration and qualification/cost caveats **next to results**, without inventing an aggregate score.

Longitudinal views explicitly derive field-level changes from frozen Run qualification snapshots (Fleet, region, account/service tier and assurance), and separately label Provider policy/runner/capability evidence refreshes. Unknown context remains unknown; an environment change is not attributed to the Model.

### Archive v0.26 — Public Research Explorer

**Implemented:** see `docs/public-research-explorer.md` and ADR 0022.

The new `/research` public surface supports server-side bounded browsing of sealed non-calibration Runs by Provider, Model, exact Test Case, evidence level, historical region/account/service tier, and native cost-estimate availability.

Every research row shows qualification and cost caveats and links into immutable Run, Model, Test, History and same-Test Compare. Reproducible URL filters, deterministic keyset pagination and dedicated indexes support broader discovery without ranking Models or equating collection volume with quality.

### Archive v0.27 — Immutable Research Collections & Sourced Exports

**Implemented:** see `docs/research-collections-exports.md` and ADR 0023.

Operators can publish bounded, immutable collections of up to 50 sealed public non-calibration Run IDs. Every public collection retains the normalized query filters, an ordered Run manifest and a SHA-256 selection digest; new Runs never silently alter its membership.

Public collection pages support sharing, live filter replay and source-backed JSON/CSV exports with qualification, access, pricing, region/tier and evidence caveats. Empty, oversized and cursor-partial captures fail closed. The export is not a comparability or quality ranking.

### Archive v0.28 — Typed Research Facets & Policy-Aware Workflows

**Implemented:** see `docs/research-facets-policy-annotations.md` and ADR 0024.

Public `/research` now discovers counts from the full filtered sealed non-calibration Run population (not the current page), grouped by Provider, canonical Model, exact Test, evidence, historical region/account/service tier, service assurance and estimated/unknown native cost. Typed facets are bounded, with explicit missing values and overflow markers.

Published immutable Research Collections can be reassessed Run-by-Run under a selected Comparability Policy version, reusing historical replication and prior same-context calibration. These interpretations never rewrite the saved Run membership or claim that the collection is a cross-Provider matched set.

### Archive v0.29+ — Reproducible Multi-Page Research Captures

Consider transaction-consistent snapshot capture beyond the 50-Run selection limit, plus policy-anchored structured annotation export. Keep immutable Run IDs, manifest digest verification and no-composite-ranking invariants.

## Scheduling principle

Collection cadence should eventually be driven by a combination of:

```text
historical value
× change likelihood
× missing evidence
× replication need
× provider cost
× access scarcity
```

This is a scheduling policy, not a model ranking.

Expensive or hard-to-register providers may receive fewer but more deliberately replicated Runs. Cheap providers should not dominate the Archive merely because they are cheap.

## Region principle

A provider that cannot legally or operationally be accessed from one region must not be silently tested through an unrelated third-party route and then labeled equivalent to first-party direct access.

If another region or account fleet is used, that execution context must become part of the Run's provenance.

## Degradation / "降智" principle

Modelapse should use the following language hierarchy:

```text
unexpected output
→ execution-environment caveat
→ repeated anomaly
→ calibration anomaly
→ possible service degradation
```

The system should not skip directly from one poor output to "model degradation".

Even "possible service degradation" remains a hypothesis unless multiple independent evidence streams support it.

## Invariants

1. Access restrictions are historical facts, not permanent Provider properties.
2. Pricing is time-varying sourced evidence.
3. Account context must exclude secrets and personal account identifiers.
4. Region context must be explicit when it affects availability or comparability.
5. A successful first-party request does not by itself prove representative service quality.
6. Suspected degradation is never inferred from one result.
7. Cost affects scheduling, not evaluation truth.
8. Missing testability evidence should remain visibly unknown rather than guessed.
9. Run evidence remains immutable even when later qualification changes.
10. Modelapse continues to prefer evidence and time over rankings.
