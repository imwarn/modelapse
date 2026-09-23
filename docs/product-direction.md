# Product direction — brand and UI

## Brand

**Modelapse** is the working brand: **Model + time-lapse**.

Descriptor:

> AI Model Test & Evolution Archive

Primary line:

> Watch AI evolve, one test at a time.

Chinese positioning:

> AI 模型实测、演进与可重放档案

The brand should be anchored visually to time-lapse/evolution so the English secondary meaning of “lapse” (temporary failure/regression) does not become the primary interpretation. That secondary meaning is acceptable because Modelapse also records regressions and drift.

Before legal launch, run formal trademark and local-language checks. The working brand decision is product direction, not trademark advice.

## Competitive boundary

Modelapse should not compete with model routers on “which model should I call right now?”

The core question is:

> How did this model, model family, or test change over time — and can I still inspect the evidence?

Artifact rendering and Replay are necessary product infrastructure, not the moat by themselves.

The moat should compound around:

1. longitudinal evolution;
2. model lineage and branch history;
3. retired-model evidence;
4. versioned Test IP + shadow suites;
5. immutable runs and replayable artifacts;
6. regression/drift history;
7. regional suites such as Chinese visual/instruction tests.

## UI priority

**Artifact > Time > Evidence > Score**

The first impression should be a living archive, not another leaderboard.

Avoid making trophies, medals, rank numbers, speedometers or generic “AI brain” graphics the core visual language.

Prefer:

- time-lapse frames;
- version nodes;
- ghosted previous states;
- film-strip / specimen-archive metaphors;
- provenance stamps;
- replay cursors.

## Primary navigation

```text
Tests
Models
Evolution
Archive
Search
```

Leaderboard/Score views can exist later but should not define the information architecture.

## Evolution Player

The signature interaction is a test-scoped model timeline.

```text
Clock Test / Provider

2024 ───────── 2025 ───────── 2026
  ●──────●────────●────●────────●
       [drag / play evolution]
```

For branching families, render lanes rather than a fake single succession chain.

```text
              Pro ─────●────●
             /
Family ─────┼─ Fast ───●──●──●
             \
              Small ───●────●
```

A track such as Flash/Fast is not intrinsically a lower or later generation. Product positioning is temporal metadata, separate from lineage.

## Run page

The Run page is the evidence page and should always expose:

- exact Test / Version / Case;
- requested and returned model identifiers;
- execution path;
- evidence level;
- timestamps;
- prompt / raw response;
- original artifact;
- canonical capture;
- Replay when safe;
- evaluator/version;
- request/response/artifact hashes;
- provider IDs and attestation metadata when available.

Provenance labels must use text + icon, not color alone.

Recommended labels:

- Direct API · Verified by Modelapse
- Routed via OpenRouter · Verified by Modelapse
- Official Product · Archived
- Community · Reproducible
- Historical Reference · Unverified

## Replay vs Run again

These are different actions.

**Replay** re-runs the already archived artifact in the sandbox.

**Run this test** makes a new model request and creates a new Run.

Keeping those verbs distinct is important for historical integrity.
