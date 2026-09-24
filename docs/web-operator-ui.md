# TanStack Start Web and Archive

The first Modelapse Web layer closes the normal product loop without moving provider execution or privileged catalog access into the browser.

```text
Browser
  |
  | public page / Archive reads
  v
TanStack Start Web
  |
  | server functions
  |  - verify MODELAPSE_WEB_OPERATOR_TOKEN for control actions
  |  - attach MODELAPSE_CONTROL_TOKEN server-side
  v
Hono API
  |
  +--> Run Planner
  +--> durable PostgreSQL Run job
  +--> public Archive projection

Runner
  |
  +--> first-party provider
  +--> evidence capture
  +--> sealed Run
  +--> deterministic Evaluation
```

## Included in v0.1

The root page provides:

- canonical Model selection;
- active published Test Case selection;
- operator-authenticated Run submission;
- durable job status polling;
- sealed Run/Evidence/Evaluation result display;
- public recent Archive browsing;
- model and Test filters.

The normal UI submits only `modelId` and `testCaseId`. Provider slug, API model alias, endpoint, prompt bytes, credentials, evidence level, and evaluator binding are still derived and revalidated by the backend.

## Credential boundary

The Web server has two different secrets:

```text
MODELAPSE_CONTROL_TOKEN
MODELAPSE_WEB_OPERATOR_TOKEN
```

They must not be equal.

`MODELAPSE_CONTROL_TOKEN` is the Hono control-plane credential. It exists only in the Web server runtime and is never intentionally serialized to the browser.

`MODELAPSE_WEB_OPERATOR_TOKEN` is the narrow v0.1 operator gate. The operator types it into the UI when starting a Run. TanStack Start sends it to the same-origin server function, which verifies it before making the privileged Hono request.

Archive reads do not require the operator token.

This is an internal operator surface, not an end-user authentication system. General accounts, sessions, organizations, roles, and community submission permissions remain outside v0.1.

## Runtime configuration

Required for a deployed Web process:

```text
MODELAPSE_API_ORIGIN=http://<modelapse-api-internal-host>:3000
MODELAPSE_CONTROL_TOKEN=<same server secret configured on the API>
MODELAPSE_WEB_OPERATOR_TOKEN=<separate operator secret>
```

Optional:

```text
MODELAPSE_BUILD=<normally baked into the image>
PORT=3000
```

The Web process does not connect directly to PostgreSQL and does not need provider credentials, signing material, or blob storage.

## Local development

Start the existing API and runner with their normal local environment, then run:

```bash
MODELAPSE_API_ORIGIN=http://127.0.0.1:3000 \
MODELAPSE_CONTROL_TOKEN=local-control-token \
MODELAPSE_WEB_OPERATOR_TOKEN=local-operator-token \
npm run dev -w @modelapse/web
```

The development Web server listens on port 3001.

## Production artifact

CI builds:

```text
docker/web.Dockerfile
```

Successful current-`main` CI publishes:

```text
ghcr.io/imwarn/modelapse-web:main
ghcr.io/imwarn/modelapse-web:sha-<full-git-sha>
```

Coolify deployment is optional until `COOLIFY_WEB_UUID` is configured. This lets Web rollout be staged without disturbing API/runner deployment.

## Archive / Run Detail v0.2

Every sealed public Run now has a stable route:

```text
/runs/<run-id>
```

The page is public and does not require the operator credential. Its loader reads only `/v1/archive/runs/:runId`, so private Test Cases and unsealed Runs remain outside the Archive projection.

The detail page exposes public verification metadata without publishing captured provider traffic:

- canonical/provider/Test identity;
- requested and returned model identifiers;
- Run status and sealed timestamps;
- runner build and execution path;
- reproducibility-oriented scalar Run configuration;
- request and response SHA-256, size and MIME metadata;
- response-header capture SHA-256;
- normalized timing and usage metadata;
- Evidence records and collector identity;
- attestation key ID, algorithm, payload hash and signature;
- Evaluation identity, evaluator definition hash, raw result hash and deterministic result.

Request and response payload bytes remain private CAS objects. Their `objectKey` values are not included in the public Archive contract.

This preserves the project rule:

```text
Run = historical fact
Evidence = provenance
Evaluation = derived view
```

The Archive list and successful operator Run result both link directly to the immutable Run detail URL.

## Archive v0.3: Model / Test detail, timeline and comparison

The public Archive now has first-class entity routes:

```text
/models/<model-id>
/tests/<test-case-id>
/compare
```

### Model detail

The Model page combines canonical catalog identity with public Archive evidence:

- provider, family, track, release/retirement metadata;
- provider snapshots and explicit model relations;
- Test coverage based on sealed public Runs;
- recent sealed Runs;
- an evolution timeline composed from dated model lifecycle events, snapshot validity, sourced model relations and sealed public Runs.

Timeline entries remain descriptive facts. Evaluation results can appear on Run events, but the timeline does not convert them into a ranking or inferred model quality trend.

### Test detail

The Test page exposes the immutable public Test identity:

- family / variant / case / version metadata;
- definition, prompt, fixture and evaluator hashes;
- origin, license, publication and active-window metadata;
- model coverage based only on sealed public Runs;
- recent Run history.

Blob object locations and raw private payloads remain excluded.

### Comparison foundation

`/compare` lets a reader select one public Test Case and 2–4 canonical models. The comparison uses the latest sealed public Run for each exact model × Test Case pair and presents the records side by side:

- exact Run identity;
- completion time;
- requested / returned model identifiers;
- execution path and evidence level;
- evaluator identity and deterministic result when available.

The comparison endpoint does not calculate an overall score, winner, ranking, or cross-Test aggregate. It is intentionally a record comparison layer that later evaluation views can build on.

Public API additions:

```text
GET /v1/archive/models/:modelId
GET /v1/archive/tests/:testCaseId
GET /v1/archive/compare?modelIds=<2-4 comma-separated UUIDs>&testCaseId=<UUID>
```

All three remain outside operator authentication and read only Archive-safe projections.

## Deliberately deferred

- general user login/session management;
- catalog administration CRUD;
- Test Pack authoring UI;
- community candidate submission/review UI;
- raw private evidence/blob access;
- long-lived WebSocket/SSE job streaming;
- server-side Archive pagination/search beyond the current bounded API;
- visual/image/video artifact rendering.
