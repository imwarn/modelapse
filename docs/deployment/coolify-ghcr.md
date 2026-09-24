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

ghcr.io/imwarn/modelapse-web:main
ghcr.io/imwarn/modelapse-web:sha-<full-git-sha>
```

The commit SHA is also baked into every image as `MODELAPSE_BUILD`.

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
COOLIFY_TOKEN=<Coolify deploy-only API token>
COOLIFY_READ_TOKEN=<Coolify read-only API token>
```

After the Web application exists in Coolify, optionally add:

```text
COOLIFY_WEB_UUID=<Coolify Web application UUID>
```

The Web UUID is deliberately optional. CI and GHCR publishing do not depend on it, and the existing API/runner deployment continues unchanged until the Web resource is configured.

Use two least-privilege Coolify tokens: `COOLIFY_TOKEN` with deploy permission to trigger deployments, and `COOLIFY_READ_TOKEN` with read permission to poll deployment status. Do not use a root token.

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
DATABASE_URL=<Coolify PostgreSQL Internal URL>
MODELAPSE_CONTROL_TOKEN=<long random server secret>
```

The API image runs the tracked Modelapse migration runner before starting Hono. Do not point `DATABASE_URL` at a public PostgreSQL endpoint when the resources share a Coolify destination.

The API service does **not** need provider API keys, the attestation private key, or the CAS volume.

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
DATABASE_URL=<same Coolify PostgreSQL Internal URL>
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
MODELAPSE_ATTESTATION_KEY_ID=...
MODELAPSE_ATTESTATION_PRIVATE_KEY_PEM=...
```

Only configure provider keys for providers you actually execute.

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

## Coolify: Web application

Create a third **Docker Image** application when you are ready to expose the UI.

Image:

```text
ghcr.io/imwarn/modelapse-web
```

Tag:

```text
main
```

Internal port:

```text
3000
```

Runtime environment:

```text
MODELAPSE_API_ORIGIN=http://<api-service-internal-host>:3000
MODELAPSE_CONTROL_TOKEN=<same value configured on the API>
MODELAPSE_WEB_OPERATOR_TOKEN=<different long random operator secret>
```

`MODELAPSE_API_ORIGIN` should use a private/internal Coolify service address where possible.

The Web service does **not** need `DATABASE_URL`, provider API keys, signing keys, or the CAS volume.

The browser never receives `MODELAPSE_CONTROL_TOKEN`. TanStack Start server functions use that token server-side when calling the Hono control API. The public Archive remains readable without operator credentials. Starting a Run and polling its private control job additionally require `MODELAPSE_WEB_OPERATOR_TOKEN`.

Do not reuse the API control token as the operator token.

The `MODELAPSE_CONTROL_TOKEN` value on the API and Web resources must be the **same secret**. Enter the raw value without wrapping quotes. Leading/trailing whitespace is ignored by current runtime normalization, but avoiding it keeps Coolify configuration unambiguous.

If operator unlock succeeds but the UI reports that the API rejected the Web control credential, the browser-to-Web operator gate is working and the failure is specifically the Web-to-API credential. Re-save the same `MODELAPSE_CONTROL_TOKEN` on both Coolify resources and redeploy both services.

## GHCR authentication

If the GHCR packages are private, authenticate the Coolify deployment server with a GitHub token that can read packages.

The Docker login must be configured for the server user Coolify uses to execute Docker commands.

If the packages are public, registry credentials are not required for pulling them.

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
    +--> GHCR API    :main + :sha-<commit>
    +--> GHCR runner :main + :sha-<commit>
    +--> GHCR web    :main + :sha-<commit>
    |
    v
Deploy API resource
    |
    +--> migration lock
    +--> pending migrations
    +--> Hono starts
    |
    v
Wait for API deployment = finished
    |
    v
Deploy runner resource
    |
    v
Wait for runner deployment = finished
    |
    +--> if COOLIFY_WEB_UUID exists:
            deploy Web resource
```

A schema migration failure blocks the runner and Web rollout. If `COOLIFY_WEB_UUID` is absent, API and runner deployment still complete normally and only the Web deployment is skipped.

## Rollback

For a deterministic rollback, select the previous immutable image tag in every deployed Coolify Docker Image resource:

```text
sha-<previous-full-git-sha>
```

Redeploy API and runner, and Web if it is deployed.

Do not rebuild source code during rollback. The immutable tag exists so production can run the exact artifact previously produced by CI.

After the incident is resolved, return deployed resources to `main` before resuming automatic deployments.

## Security boundary

GitHub Actions requires no runtime provider, database, signing, control-plane, or Web operator credentials.

Do **not** add these to GitHub Actions secrets:

```text
OPENAI_API_KEY
DEEPSEEK_API_KEY
MODELAPSE_ATTESTATION_PRIVATE_KEY_PEM
DATABASE_URL
MODELAPSE_CONTROL_TOKEN
MODELAPSE_WEB_OPERATOR_TOKEN
```

They belong in Coolify runtime configuration only.

GitHub Actions needs the five core Coolify environment secrets listed above, plus the optional `COOLIFY_WEB_UUID` once automatic Web deployment is desired. GHCR publishing uses the workflow-provided `GITHUB_TOKEN`.

## Release ordering

The production publish workflow is triggered from a successful `CI` workflow on `main`, not directly from a push.

It also compares the CI commit with the current `main` SHA. If a newer merge has already landed, an older successful CI run is ignored. This prevents an out-of-order Actions completion from republishing an older build as `:main`.
