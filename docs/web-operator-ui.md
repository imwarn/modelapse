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

## Archive v0.4: repeat history, temporal comparison and relation graph

The Archive now treats repeated executions as a first-class time series rather than collapsing a model × Test pair to one latest row.

Public route:

```text
/history/<model-id>/<test-case-id>
```

Public API:

```text
GET /v1/archive/history?modelId=<UUID>&testCaseId=<UUID>&limit=<1-100>
```

### Repeat-run history

A history record contains the same canonical Model and exact public Test Case plus up to 100 sealed public Runs ordered by capture time.

The projection also includes explicit `run_relations` edges when both endpoints are inside the public returned history. Supported schema relations already include:

```text
reproduces
retry_of
repeat_of
derived_from
```

The Run detail page exposes only relations whose opposite endpoint is also sealed and public. A relation can therefore never leak the identifier of a private or unsealed Run.

Repeated Runs do not require an explicit `repeat_of` edge to appear in temporal history: identical model × exact Test Case membership is a factual grouping. Explicit relation edges add stronger lineage semantics when they have actually been recorded.

### Same-Test temporal comparison

The Compare page still shows each selected model's latest sealed Run first, then adds a temporal lane for the same exact Test Case. Each lane preserves capture order and links to the immutable Run records and full pair history.

No slope, winner, quality trend, causal explanation, or cross-Test aggregate is inferred from result changes.

### Model relation visualization

Model Detail renders direct `model_relations` as directed graph rows. The UI preserves the stored edge direction and relation type rather than visually inventing ancestry.

The existing source ID, validity interval, and confidence remain part of the canonical Model relation projection.

### Query indexes

Migration `0006_archive_temporal_indexes.sql` adds:

- a partial sealed-Run index on `(model_id, test_case_id, completed_at, created_at)` for pair history reads;
- an incoming `run_relations(to_run_id, created_at)` index so Run detail can resolve both relation directions efficiently.

The migration changes indexing only; it does not alter historical records or introduce mutable summary tables.

## Archive v0.5: source and identity timeline

Modelapse now treats catalog identity itself as a time-varying, sourced Archive record.

No new privileged browser surface is introduced. The existing public Model and Test detail APIs return additional Archive-safe provenance projections.

### Model identity timeline

`GET /v1/archive/models/:modelId` now includes:

- the canonical Model source record;
- provider snapshot sources;
- Model relation sources;
- alias-resolution observations that resolved to the Model or one of its snapshots;
- execution-binding history for provider endpoint + API model ID + optional snapshot;
- a dedicated identity timeline composed from canonical-source retrieval, alias observations, binding validity and snapshot validity.

A public source summary contains only:

```text
id
sourceType
url
title
author
publishedAt
retrievedAt
contentSha256
```

The public projection deliberately excludes `source_records.metadata` and `alias_resolution_events.raw_observation`.

This lets the Archive answer questions such as:

```text
At time T, what did provider alias A resolve to?
Which provider endpoint/API model ID was bound to canonical Model M?
Which source record supports that identity claim?
Was the binding tied to a provider snapshot?
```

without exposing internal observation payloads.

### Test version history

`GET /v1/archive/tests/:testCaseId` now includes:

- Test Family canonical source;
- current Test Version source;
- version history for the same Test Variant;
- immutable definition hash, publication/creation time, license and evaluator identity per version;
- the number of public Test Cases in each version;
- a linkable public Test Case ID when the current case slug also exists in another version.

Only Test Versions that contain at least one public Test Case are included in public history. Private-only or case-less draft versions are not surfaced through this projection.

### Version-level provenance

Migration `0007_identity_provenance.sql` adds a nullable `test_versions.source_id` foreign key to `source_records`.

Existing Test Versions are backfilled from their Test Family canonical source when one is available. Catalog bootstrap now writes version provenance directly for new Test definitions.

The same migration adds indexes for:

- alias observations resolved by canonical Model;
- alias observations resolved by provider snapshot;
- Test Variant version-history reads.

### Identity vs execution evidence

v0.5 keeps two provenance questions separate:

```text
Catalog identity provenance
  = why Modelapse says this alias/binding/snapshot identifies this Model

Run evidence
  = what happened during one actual model execution
```

A sourced alias or binding does not upgrade Run Evidence level, and a sealed Run does not by itself rewrite canonical catalog identity.

## Archive v0.6: Catalog Change Detection / Identity Drift

v0.6 turns the sourced identity history introduced in v0.5 into an explicit change feed.

The guiding rule is:

```text
observation != change
change = a sourced chronological transition between two different identity states
```

Repeated observations of the same alias target are retained as provenance, but they do not become drift events. A drift event appears only when consecutive comparable records differ.

### Derived, not authoritative

Catalog drift is intentionally a derived Archive view rather than a mutable event ledger.

Migration `0008_catalog_identity_drift.sql` creates:

```text
modelapse.catalog_identity_drift_events
```

from the underlying temporal records with windowed predecessor comparisons.

This keeps the dependency direction explicit:

```text
source record
  -> alias observation / execution binding
  -> derived drift event
```

and never:

```text
drift event
  -> rewrite canonical identity
```

If historical source-backed catalog facts are backfilled before later observations, the derived view can be recomputed from those facts instead of leaving a stale copied change record behind.

### Alias target drift

Alias history is compared independently for each provider alias.

A public `alias_target_changed` event is emitted when a later sourced observation changes one or both of:

```text
resolved canonical Model
resolved provider Snapshot
```

A repeated observation of the same Model + Snapshot produces no drift event.

Alias observations become append-only in v0.6. New inserts are also checked for provider consistency:

- the alias provider must match the resolved Model provider;
- a resolved Snapshot must belong to a Model from that provider;
- when both Model and Snapshot are present, the Snapshot must belong to that exact Model.

### Execution-binding drift

Execution bindings are compared as temporal routes for the same canonical Model and execution-path class.

A public `execution_binding_changed` event can report changes to:

```text
endpoint
api_model
snapshot
```

The view only treats a binding as a replacement when the predecessor is explicitly closed and its `valid_to` is not later than the successor's `valid_from`. Parallel routes are therefore not automatically interpreted as a replacement.

v0.6 also protects execution-binding history:

- binding identity fields are immutable after insert;
- a current binding may be closed once by setting `valid_to`;
- a closed binding cannot be reopened or rewritten;
- bindings cannot be deleted.

### First-party identity observer

`PgModelCatalogAdmin.observeFirstPartyIdentity(...)` is the first ingestion primitive intended for repeated catalog observations rather than one-time bootstrap.

Each invocation records a fresh `source_records` row for that retrieval. This is deliberate: two retrievals of the same provider documentation URL are distinct observations even when their human-readable title is unchanged.

For one canonical Model the observer:

1. resolves the sourced first-party direct endpoint valid at the observation time;
2. records a fresh source observation;
3. resolves or creates the observed provider Snapshot;
4. compares the current logical first-party-direct execution binding;
5. closes and replaces that binding only when endpoint/API-model/Snapshot identity changed;
6. appends a chronological alias-resolution observation.

The observer serializes updates with PostgreSQL advisory transaction locks for both the canonical Model and the Provider alias. That prevents concurrent observations of the same alias from being appended out of chronological order even when the alias moves between canonical Models. It also rejects ambiguous multiple-current-direct-binding state.

An operational CLI wraps the same primitive without adding a catalog-write HTTP endpoint:

```bash
MODELAPSE_PROVIDER_SLUG=deepseek \
MODELAPSE_CANONICAL_MODEL_SLUG=deepseek-flash \
MODELAPSE_API_MODEL_ID=deepseek-flash \
MODELAPSE_PROVIDER_SNAPSHOT_ID=<optional-provider-snapshot> \
MODELAPSE_SOURCE_URL=<provider-source-url> \
MODELAPSE_SOURCE_TITLE=<provider-source-title> \
MODELAPSE_SOURCE_CONTENT_SHA256=<optional-lowercase-sha256> \
MODELAPSE_OBSERVED_AT=<optional-iso8601-time> \
npm run observe:first-party-identity -w @modelapse/catalog-admin
```

If `MODELAPSE_OBSERVED_AT` is omitted, the observer uses the current process time. A repeated collector should still capture source bytes/hash upstream when possible so identical URLs with different retrieved content remain distinguishable.

### Public change feed

Public API:

```text
GET /v1/archive/changes
GET /v1/archive/changes?modelId=<UUID>
GET /v1/archive/changes?provider=<provider-slug>
GET /v1/archive/changes?limit=<1-100>
```

The response exposes only Archive-safe identity states and source summaries.

Each event contains:

```text
changeType
occurredAt
provider
alias (when applicable)
changedFields
previous identity state
current identity state
previous source summary
current source summary
```

The underlying `raw_observation` and `source_records.metadata` remain outside the public contract.

### Archive UI

The public `/changes` route presents the latest detected identity transitions with client-side Provider / Model / change-type filters.

Model Detail also embeds the changes touching that canonical Model under **Identity Drift**.

The UI renders explicit **Before → After** states. It does not assign severity, infer intent, claim that a provider silently changed a model, or turn catalog drift into a model-quality judgment.

### Drift vs Run behavior

Identity drift and model-output changes remain separate dimensions:

```text
Catalog drift
  = provider/catalog identity facts changed

Run variation
  = two executions produced different captured/evaluated results
```

A catalog drift event does not prove a behavioral regression or improvement. A changed Run result does not prove that the provider alias or execution binding changed.

## Deliberately deferred

- general user login/session management;
- catalog administration CRUD;
- Test Pack authoring UI;
- community candidate submission/review UI;
- raw private evidence/blob access;
- long-lived WebSocket/SSE job streaming;
- server-side Archive pagination/search beyond the current bounded API;
- visual/image/video artifact rendering.
