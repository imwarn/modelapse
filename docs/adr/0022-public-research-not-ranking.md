# ADR 0022 — Public research is a bounded index of evidence, not a leaderboard

## Status

Accepted for Archive v0.26.

## Context

The public Archive already exposed latest Runs, per-Test comparisons, and longitudinal timelines. Visitors needed a first-class way to discover records across Providers, inspect evidence gaps, and revisit specific slices without treating the most-collected Provider as the best Provider.

## Decision

1. Add a public server-side research query restricted to sealed completed non-calibration public Runs.
2. Expose typed facets for canonical model, Provider, exact Test Case, evidence availability, historical execution context and native cost availability.
3. Keep every row attached to immutable Run, Model and Test identities, qualification caveats and frozen cost evidence.
4. Bound queries to 1–50 rows and paginate by completed timestamp plus Run ID; use a strictly validated opaque cursor.
5. Provide shareable URLs for filters and pagination.
6. Never interpret absent cost estimate as free or absent access evidence as unrestricted.
7. Exclude calibration Test Cases from benchmark research by source `case_type`, not UI label alone.
8. Use existing same-Test Comparability and History views for eligibility and temporal interpretation; the Research index itself makes no matched-set guarantee.
9. Preserve the distinction between collection volume and model capability; no aggregate ranking, winner or score is computed.
10. Do not rewrite historical Runs, Evidence or Evaluations.

## Consequences

Research discovery can scale independently of the homepage's latest Runs and remains auditable through row-level links, while cost/region/qualification limitations stay visible rather than being hidden by an aggregate number.
