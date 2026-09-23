# ADR 0008 — GitHub Actions builds production images; Coolify deploys them

Status: Accepted

## Decision

Production Docker images are built exactly once by GitHub Actions after the repository CI workflow succeeds on the current `main` commit.

The images are published to GitHub Container Registry and then deployed by Coolify as Docker Image resources.

Coolify does not clone Modelapse or rebuild the Dockerfiles for production deployment.

## Rationale

This preserves artifact identity between CI and production:

- the image that passed the release build is the image Coolify runs;
- API and runner are published independently but deployed only after both pushes succeed;
- every release has an immutable full-commit SHA tag;
- rollback does not require recompilation;
- runtime provider/signing/database secrets remain outside GitHub Actions.

## Tags

Each image receives:

- mutable `main` for automatic production deployment;
- immutable `sha-<full-git-sha>` for provenance and rollback.

The image also contains `MODELAPSE_BUILD=<full-git-sha>`.

## Stale workflow protection

A successful CI run is not sufficient by itself.

Before publishing, the release workflow asks GitHub for the current `main` SHA. If it differs from the CI run SHA, the release is stale and publishing is skipped.

This prevents an older slow CI run from overwriting the production `main` tag after a newer commit has already landed.

## Runtime separation

The API and runner remain separate Coolify resources.

The API may receive the internal control-plane token but does not receive provider credentials or signing keys.

The runner receives provider/signing secrets but exposes no public HTTP port.

## Deployment trigger

After both GHCR images are pushed, GitHub Actions calls the Coolify deployment API with both resource UUIDs.

If Coolify repository configuration is absent, image publication still succeeds and deployment is skipped. This allows the repository workflow to merge before infrastructure-specific values are provisioned.
