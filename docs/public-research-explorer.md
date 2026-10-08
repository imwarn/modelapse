# Public Research Explorer — Archive v0.26

Archive v0.26 turns the historical archive into a **bounded, shareable research index**. It does not publish a general leaderboard.

## Surface

The public route `/research` supports server-side filtering by:

- Provider and canonical Model;
- exact Test Case;
- E4/E5 evidence, missing evidence level, or any level;
- execution region, account tier, effective service tier;
- known native cost estimate versus unknown estimate.

Each result shows the specific Provider/Model/Test, Run identity and completion time, evaluator observation, evidence level, execution region/account/service assurance, estimated **native-currency** cost when available, frozen qualification caveats and frozen pricing/usage caveats.

Each record links to its Run evidence, Model, Test, chronological History, and a preselected same-Test Compare view. Unlike a homepage's latest 30 Runs, this is a server-side query across matching archival rows.

## Public API

```text
GET /v1/archive/research
  ?provider=<provider-slug>
  &modelId=<uuid>
  &testCaseId=<uuid>
  &evidence=any|E4+|missing
  &region=<region>
  &accountTier=<tier>
  &serviceTier=<effective-tier>
  &cost=any|estimated|unknown
  &limit=1..50
  &cursor=<opaque>
```

The response is:

```json
{
  "research": {
    "scope": "sealed_public_non_calibration",
    "runs": [],
    "nextCursor": null,
    "hasMore": false
  }
}
```

The query is restricted to sealed, completed Runs of public non-calibration Test Cases. It uses parameterized SQL, strict filter validation, and keyset pagination by `(completed_at DESC, run_id DESC)`, with at most 50 Runs per request (default 20). The cursor embeds only the previous page's timestamp and Run UUID. It contains no account credentials and is not a signed authorization token.

The URL retains the chosen filters and cursor. Opening an older page will not silently reinterpret unknown pricing as zero. A matching archive row has not necessarily passed a comparability or calibration policy.

## Interpretation boundaries

1. A Run is an archival observation. Showing it does not mean that it is eligible for leaderboard or matched cross-provider comparison.
2. The research surface explicitly excludes calibration canaries, which are service-health evidence rather than benchmark scores.
3. A native cost estimate is not an invoice and must not be converted to another currency without sourced FX data.
4. **Unknown cost does not mean free.** `cost=unknown` means no complete native estimate is available, not that no money was spent.
5. E4/E5 is evidence about a first-party controlled execution path. It is not a performance rating or a guarantee of representative service quality.
6. Region/tier filters constrain preserved historical Run context, not current Provider access policy or operator credentials.
7. Time order is not performance rank. Records are presented newest-first, without aggregating heterogeneous Test categories or inferring a model winner.
8. The same-Test Compare surface remains the authoritative entry for explicit comparability-policy eligibility, replication, and recent calibration context.
9. No historical Run, Evaluation, qualification envelope, or cost ledger row is mutated.

## Operational verification

- New PostgreSQL indexes support newest-first and Provider-scoped keyset lookup.
- Unit tests verify strict cursor handling, filters and bounds.
- Persistence integration exercises two pages of Run history, E4+, region and calibration exclusion using real PostgreSQL.
- Public API unit tests verify unauthenticated access and malformed-query rejection.
- Full CI must pass Typecheck, Unit, Build, repeatable migrations, integration and three image builds before merge.

## Possible follow-ups (v0.27+)

Additional typed facets, saved research slices or export endpoints can be added with documented scope and reproducibility guarantees. Avoid releasing arbitrary aggregate scores or ranking models by number of runs, especially because collection cadence is constrained by cost and access scarcity.
