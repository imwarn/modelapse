# ADR 0004 — Runtime and deployment stack

Status: Accepted for foundation v0.1, with TanStack Start deferred until web implementation.

## Decision

Use a TypeScript/Node.js monorepo with:

- **Hono** for the stable HTTP API/control-plane service;
- **TanStack Start** as the preferred web/SSR candidate when the product UI is implemented;
- **PostgreSQL** as the relational source of truth;
- **S3-compatible object storage** for content-addressed raw responses/artifacts/captures;
- **Docker images** as the production deployment unit;
- **Coolify on a VPS** as a suitable initial deployment/control plane.

Do not collapse the runner/capture sandbox into the public API process.

## Why Hono

The API mostly needs a small standards-based HTTP surface around catalog/run/evidence data and job submission. Hono has an official Node adapter and official Docker guidance, while preserving a Web-standards request/response model.

The API should expose stable resource endpoints. It should not contain Test-specific benchmark logic.

Current reference:
- https://hono.dev/docs/getting-started/nodejs

## Why TanStack Start, but not yet

Modelapse will need SSR/SEO, data loaders, interactive artifact pages and a sophisticated Evolution Player. TanStack Start is a good fit for that product surface and provides server functions.

However, Start server functions are intended for the Start application itself. They should not become the canonical public API or the runner control plane. The Hono API remains the stable boundary.

We intentionally defer scaffolding the web app until the Run/Test/Model API contracts are stable enough that the UI is not dictating the archive schema.

Reference:
- https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- https://tanstack.com/start/latest/docs/framework/react/guide/production-checklist

## PostgreSQL

PostgreSQL remains the source of truth for catalog metadata, temporal alias history, lineage, Run metadata, evidence references and evaluation metadata.

Large raw bytes do not belong in PostgreSQL. Store them in content-addressed object storage and keep immutable SHA-256 references in Postgres.

For local development we currently pin PostgreSQL 18.6.

## Process boundaries

Initial deployment should stay operationally simple while preserving security boundaries:

```text
Internet
   │
   ├── web       (TanStack Start, later)
   └── api       (Hono)
                  │
                  ├── PostgreSQL
                  ├── Object storage
                  └── Job queue
                         │
                         ├── runner workers
                         └── capture/replay workers
```

The API may schedule a benchmark run, but **must not execute untrusted model-generated HTML/JS or agent code in-process**.

## E4 direct-run security

Application host allowlists are not sufficient by themselves.

Production E4 runner containers should also have infrastructure-level outbound controls so the runner can reach only the intended first-party provider endpoints and required internal services. Redirect following is disabled by the evidence transport.

API keys are injected at execution time and never stored in Run blobs or attestations.

## Coolify

Coolify is a good initial fit because it can deploy Docker images or repository-defined Compose services on our own servers. Production images should be deployed by immutable digest (or immutable release tag), not a mutable `latest` tag.

Reference:
- https://coolify.io/docs/applications/deployments/docker-image
- https://coolify.io/docs/applications/builds/docker-compose

Recommended production resource split:

- `modelapse-api` image;
- future `modelapse-web` image;
- future `modelapse-runner` image with strict egress policy;
- future `modelapse-capture` image with stricter sandboxing;
- PostgreSQL as a separate persistent service/resource;
- object storage outside replaceable application containers.

## What we are not choosing yet

- No Kubernetes.
- No large microservice fleet.
- No ORM as schema source of truth.
- No Redis requirement until a real queue workload exists.
- No production self-hosted object store requirement; S3/R2/compatible providers remain options.

The goal is a small number of replaceable processes around stable contracts, not infrastructure complexity.
