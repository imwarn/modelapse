# ADR 0001 — Runs and evidence are facts; scores are derived

Status: Accepted for v0.1

Modelapse must survive model retirement, evaluator changes and moving aliases. The atomic historical record is an immutable Run plus append-only Evidence and content-addressed raw blobs.

Evaluations, captures, previews, comparisons and leaderboards are versioned projections and may be recomputed.

Consequences: old scores remain reproducible; broken artifacts remain valid history; UI pages resolve to concrete run IDs; storage grows faster than a score-only benchmark, but the archive remains auditable.
