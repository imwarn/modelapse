# Typed Research Facets & Policy-Anchored Annotations — Archive v0.28

Archive v0.28 extends public evidence exploration without introducing cross-Test scores, unofficial leaderboards, or retroactive Run mutation.

## Observed research facets

Public endpoint:

```text
GET /v1/archive/research/facets
  ?provider=<provider-slug>
  &modelId=<uuid>
  &testCaseId=<uuid>
  &evidence=any|E4+|missing
  &region=<region>
  &accountTier=<tier>
  &serviceTier=<effective-tier>
  &cost=any|estimated|unknown
```

All filters use the same validation and historical field semantics as `/v1/archive/research`. No cursor is allowed: counts are computed over **all sealed completed public non-calibration Runs matching the entire active filter set**, not the first 20 results and not the entire unfiltered Archive unless filters are empty.

Response:

```json
{
  "facets": {
    "scope": "sealed_public_non_calibration",
    "counting": "matching_runs_all_pages",
    "totalMatches": 0,
    "perFacetLimit": 25,
    "facets": {
      "provider": { "values": [], "truncated": false },
      "model": { "values": [], "truncated": false },
      "test": { "values": [], "truncated": false },
      "evidence": { "values": [], "truncated": false },
      "region": { "values": [], "truncated": false },
      "accountTier": { "values": [], "truncated": false },
      "serviceTier": { "values": [], "truncated": false },
      "serviceAssurance": { "values": [], "truncated": false },
      "cost": { "values": [], "truncated": false }
    }
  }
}
```

Each facet value has a `value` string or `null` (missing/unknown) and an integer `count`. Top values sort by descending observed Run count then value, with at most 25 values per facet, and `truncated=true` when more exist. Unknown region, account or assurance is not treated as a valid tier or hidden.

Evidence buckets are `E4+`, `below_E4`, and `missing`. These represent evidence availability, **not model performance**. The current filter API permits `any`, `E4+`, and `missing`; below-E4 is displayed for audit but not as a selectable filter. Cost buckets are `estimated` / `unknown`, never `free`.

The public `/research` page displays observed counts and links to applicable facets. Counts represent **Run records, not unique Models, Tests or users**. Selecting a value applies it on top of all other active filters; a selected facet's counts are likewise already constrained by that filter.

## Per-Run policy assessment of immutable research collections

Public endpoint:

```text
GET /v1/archive/research/collections/:collectionId/assessment?policyVersion=<version>
```

The endpoint first verifies the saved collection's immutable Run membership and SHA-256 manifest. It then loads the requested append-only Comparability Policy, and reuses the **v0.23 per-Run evaluator** against each captured Run in stored manifest order. Results include:

- exact `policy.version` and policy definition;
- `collectionId` and `manifestSha256`;
- `scope="per_run_only_not_cross_provider_match"`;
- each captured `runId`, `eligible/ineligible/unknown` status, machine-readable reasons;
- required/observed replication count in the Run's original execution context;
- only prior same-context calibration evidence and anomaly detail, never a later canary retroactively applied.

The policy is selected at *interpretation time*; applying a new version to an old selection does not change the original Run, collection membership, or selection digest. The page makes the selected policy version and result scope visible. No aggregate readiness score or collection-wide matched status is calculated; to evaluate a matched cross-provider set, visitors must still use the **same-Test `/compare`** interface.

The `/research/collections/:id` page has a user-triggered assessment action and a policy-version selector, so it does not assume a newest policy is equivalent to the policy in effect when a Run was executed. Stored JSON/CSV exports from v0.27 retain their *sourced immutable Run representation* and do not silently merge a dynamic policy assessment.

## Provenance and invariants

1. Facet counts are historical observations, not current Provider catalog capability or a live access-status check.
2. Facets count Runs across the whole filtered query; there is no accidental current-page sampling.
3. Missing qualification attributes remain unknown, never default or unrestricted.
4. A Run's individual eligibility is not a cross-Provider matched-set verdict.
5. Calibration evidence must predate each evaluated Run and match its frozen context.
6. Historical Run, cost, qualification, calibration and saved-selection manifest rows remain immutable.
7. All queries are bounded by a typed filter vocabulary, or by immutable collection IDs capped at 50 Runs. Distinct facet lists are bounded and explicitly marked if truncated.
8. Display order or observation volume is never a ranking or model performance score.

## Verification

- Public API tests assert facet count payload shape, malformed request rejection, versioned assessment metadata and immutable manifest linkage.
- PostgreSQL integration verifies total counts across two pages of historical Runs, scoped region/evidence facets, empty populations, cursor rejection, and policy-version Run assessment without modifying saved Runs.
- Standard CI validates TypeScript, unit tests, migrations, persistence/queue/provider integration and production Docker images.

### Deferred follow-up (v0.29+)

A future explicitly transaction-scoped, multi-page frozen collection protocol may lift the 50-Run snapshot limit; it must not silently truncate or treat a saved cursor as a complete research slice.
