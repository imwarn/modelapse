# Test Pack authoring

A Test Pack is the portable definition of a Modelapse test version. Tests must not be hard-coded into web routes or provider adapters.

## Rules

1. Published pack content is immutable. Behavioral changes create a new version.
2. Preserve verbatim historical prompts as distinct cases.
3. Active shadow cases remain private.
4. Imported community tests keep author/source/license metadata.
5. Do not claim Modelapse authorship for an adopted external test.
6. Runtime policy is referenced so sandbox rules remain centrally auditable.
7. Evaluator and renderer versions are independent from Test Pack versions.

## Community intake

A discovery first enters the candidate registry, then can become:

- **Referenced** — history/link only; no full redistribution.
- **Imported** — source and rights permit a replayable pack.
- **Adopted** — Modelapse maintains a versioned fork/evaluator while preserving attribution.

Popularity alone is not enough. Prefer tests with visual immediacy, reproducibility, discriminative power, replayability, clear rights and shadow-suite potential.
