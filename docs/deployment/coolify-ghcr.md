# GHCR → Coolify production deployment

Modelapse production images are built by GitHub Actions and deployed by Coolify as prebuilt Docker images.

Coolify must **not rebuild the repository** for these resources. GitHub Actions is the build authority; Coolify is the runtime/deployment authority.

## Published images

After the `CI` workflow succeeds on the current `main` commit, `.github/workflows/publish-images.yml` publishes:

```text
ghcr.io/imwarn/modelapse-api:main
ghcr.io/imwarn/modelapse-api:sha-<full-git-sha>

ghcr.io/imwarn/modelapse-runner:main
ghcr.io/imwarn/modelapse-runner:sha-<full-git-sha>
```

The commit SHA is also baked into each image as `MODELAPSE_BUILD`.

The mutable `:main` tag is used for automatic production updates. The immutable `:sha-...` tag is retained for deterministic rollback.

The publishing workflow refuses to publish a successful but stale CI run if `main` has already advanced to a newer commit.

## GitHub production environment configuration

Create a GitHub Actions environment named:

```text
production
```

Add these **Environment secrets** to that environment:

```text
COOLIFY_URL=https://coolify.example.com
COOLIFY_API_UUID=<Coolify API application UUID>
COOLIFY_RUNNER_UUID=<Coolify runner application UUID>
COOLIFY_TOKEN=<Coolify API token>
```

The deploy job explicitly targets the `production` environment, so these values do not need to be duplicated as repository-level variables or secrets.

If these values are absent, GitHub Actions still publishes both GHCR images but skips the Coolify deployment trigger.

The Coolify API token only needs the permissions required to deploy the two resources.

## Coolify: API application

Create a **Docker Image** application.

Image:

```text
ghcr.io/imwarn/modelapse-api
```

Tag:

```text
main
```

Internal port:

```text
3000
```

Recommended health check:

```text
/readyz
```

Runtime environment:

```text
DATABASE_URL=...
MODELAPSE_CONTROL_TOKEN=...
```

`MODELAPSE_BUILD` is already embedded in the image and should normally not be overridden.

The API service does **not** need:

- `OPENAI_API_KEY`;
- the attestation private key;
- the CAS volume.

## Coolify: runner application

Create a second **Docker Image** application.

Image:

```text
ghcr.io/imwarn/modelapse-runner
```

Tag:

```text
main
```

Do not expose a public port.

Required runtime environment:

```text
DATABASE_URL=...
OPENAI_API_KEY=...
MODELAPSE_ATTESTATION_KEY_ID=...
MODELAPSE_ATTESTATION_PRIVATE_KEY_PEM=...
```

The runner image defaults to:

```text
MODELAPSE_RUNNER_MODE=queue
MODELAPSE_BLOB_ROOT=/var/lib/modelapse/blobs
```

Optional tuning:

```text
MODELAPSE_PROVIDER_TIMEOUT_MS=120000
MODELAPSE_JOB_LEASE_SECONDS=300
MODELAPSE_JOB_POLL_MS=1000
MODELAPSE_WORKER_ID=...
MODELAPSE_EVIDENCE_COLLECTOR=...
```

Attach persistent storage at:

```text
/var/lib/modelapse/blobs
```

The current filesystem CAS design is a single-host deployment baseline. Do not scale runner instances across machines until an S3/R2/MinIO-compatible BlobStore is available.

## GHCR authentication

If the GHCR packages are private, authenticate the Coolify deployment server with a GitHub token that can read packages.

The Docker login must be configured for the server user Coolify uses to execute Docker commands.

If the packages are made public, registry credentials are not required for pulling them.

## Automatic deployment flow

```text
merge to main
    |
    v
CI
    |
    | success on current main only
    v
Publish production images
    |
    +--> GHCR API :main + :sha-<commit>
    |
    +--> GHCR runner :main + :sha-<commit>
    |
    v
POST <COOLIFY_URL>/api/v1/deploy
    ?uuid=<api-uuid>,<runner-uuid>
    |
    v
Coolify pulls the new :main images
```

The deployment trigger only runs after both images have been pushed successfully.

## Rollback

For a deterministic rollback, select the previous immutable image tag in each Coolify Docker Image resource:

```text
sha-<previous-full-git-sha>
```

Redeploy both resources.

Do not rebuild source code during rollback. The point of the immutable tag is to run the exact artifact previously produced by CI.

After the incident is resolved, return both resources to `main` before resuming automatic deployments.

## Security boundary

GitHub Actions requires no runtime provider credentials.

Do **not** add these to GitHub Actions secrets:

```text
OPENAI_API_KEY
MODELAPSE_ATTESTATION_PRIVATE_KEY_PEM
DATABASE_URL
MODELAPSE_CONTROL_TOKEN
```

They belong in Coolify runtime configuration only.

GitHub Actions needs only the four Coolify values stored as `production` environment secrets. GHCR publishing uses the workflow-provided `GITHUB_TOKEN`.

## Release ordering

The production publish workflow is triggered from a successful `CI` workflow on `main`, not directly from a push.

It also compares the CI commit with the current `main` SHA. If a newer merge has already landed, an older successful CI run is ignored. This prevents an out-of-order Actions completion from republishing an older build as `:main`.
