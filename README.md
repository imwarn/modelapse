# Modelapse

**AI Model Test & Evolution Archive**

> Watch AI evolve, one test at a time.

Modelapse is built around one rule: **scores are views; runs and evidence are facts**.

This repository contains the foundation for:

1. PostgreSQL DDL for model lineage, versioned tests, immutable runs, artifacts, evaluations, provenance and community intake.
2. Shared TypeScript domain types.
3. A transport-free Provider Adapter contract so Modelapse controls network execution and provenance capture.
4. A Test Pack SDK for versioned icon/public/shadow cases.

## Architecture

```text
Catalog
  ├─ Models / snapshots / aliases / lineage
  └─ Test families / variants / versions / cases
                  │
                  ▼
Execution ── Provider Adapter ── Evidence Transport
                  │
                  ▼
                Run  ───────────── Evidence
                  │
                  ▼
              Artifact
                  │
           ┌──────┴──────┐
           ▼             ▼
        Replay        Evaluation
           └──────┬──────┘
                  ▼
        UI / SEO / Evolution
```

## Layout

```text
packages/
  database/
  domain/
  provider-adapter/
  testpack-sdk/
schemas/
examples/testpacks/
docs/
```

## Invariants

- A sealed Run is immutable.
- Original artifacts are content-addressed and never silently patched.
- Published Test Versions are immutable.
- Model aliases are time-dependent observations.
- Model lineage is a DAG.
- Direct, routed, cloud-hosted and first-party-product execution are distinct.
- Community claims never become Verified First-party Direct from screenshots, JSON files or request IDs alone.
- Evaluations are versioned derived data.

## Development

Node.js 22+ and PostgreSQL 16+.

```bash
npm install
npm run typecheck
npm test
```

The database migration is plain PostgreSQL SQL by design; the domain is not coupled to an ORM yet.
