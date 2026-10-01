# Catalog Observer / Scheduled Collection

Archive v0.7 turns the v0.6 first-party identity observer into a periodic collection pipeline.

The collector is intentionally **observe-first**. Fetching a first-party catalog does not, by itself, create a new canonical Model or remap an unknown model ID. Raw first-party snapshots are preserved first; only model IDs that already match a current sourced first-party execution binding are forwarded to the v0.6 identity observer.

## Data flow

```text
runner scheduler
    |
    v
catalog_observer_sources
    |
    | claim due rows (FOR UPDATE SKIP LOCKED)
    v
first-party HTTP fetch
    |
    +--> source_records
    +--> catalog_source_snapshots (append-only raw response)
    +--> catalog_collection_runs
    |
    v
known current first-party bindings only
    |
    v
observeFirstPartyIdentity(...)
    |
    +--> model_snapshots
    +--> alias_resolution_events
    +--> model_execution_bindings
    |
    v
catalog_identity_drift_events (v0.6)
```

Collection and identity ingestion remain separate failure boundaries. A valid HTTP snapshot is retained even if parsing or one model observation fails.

## Default sources

Sources are registered lazily when their Provider already exists in the catalog.

| Provider | Source | Kind | Default interval | Credential |
| --- | --- | --- | ---: | --- |
| OpenAI | `https://api.openai.com/v1/models` | model list | 6 h | `OPENAI_API_KEY` |
| OpenAI | Responses API reference | docs | 24 h | none |
| DeepSeek | `https://api.deepseek.com/models` | model list | 6 h | `DEEPSEEK_API_KEY` |
| DeepSeek | Responses API guide | docs | 24 h | none |

The schema is source-driven: additional first-party sources can be added to `catalog_observer_sources` without adding another scheduler.

## Identity policy

For a `model_list` response, the collector compares returned IDs with current sourced `first_party_direct` execution bindings.

- A matching ID is sent to `observeFirstPartyIdentity`.
- If the payload exposes an explicit snapshot/version field, it can advance the provider Snapshot and therefore feed the v0.6 drift engine.
- If no explicit snapshot/version is present, the current known Snapshot is preserved. Merely re-fetching a model list cannot erase a Snapshot.
- A remote ID that does not match an existing binding is retained in the collection-run metadata as `unmatchedRemoteModelIds`; it is **not** promoted to a canonical Model.
- A known bound ID missing from the remote list is recorded as `missingKnownApiModelIds`; absence alone does not retire or rewrite the Model.

This keeps discovery evidence separate from canonical identity decisions.

## Scheduling and concurrency

The queue runner enables the Catalog Observer by default. It polls for due sources every 60 seconds, while each source controls its own collection interval through `interval_seconds` and `next_run_at`.

Due work is claimed in a short PostgreSQL transaction with `FOR UPDATE SKIP LOCKED`. The claim advances `next_run_at` before network I/O. This prevents multiple runner processes from collecting the same source concurrently without holding database locks across HTTP requests.

The collector itself runs beside the Run queue worker and does not block a provider test job while the HTTP collection is in flight.

## Collection status

Each attempt is recorded in `catalog_collection_runs`:

- `succeeded`: snapshot stored and all eligible observations were emitted.
- `partial`: snapshot stored, but one or more eligible identity observations failed.
- `failed`: HTTP, size, JSON/parser, or persistence failure prevented a complete collection.
- `skipped`: a configured source requires a credential that is not available to the runner.

Raw response bodies are stored in `catalog_source_snapshots` and are not exposed by the public Archive API.

## Runner configuration

Optional environment variables:

```text
MODELAPSE_CATALOG_OBSERVER_ENABLED=true
MODELAPSE_CATALOG_OBSERVER_POLL_MS=60000
MODELAPSE_CATALOG_OBSERVER_TIMEOUT_MS=30000
MODELAPSE_CATALOG_OBSERVER_MAX_RESPONSE_BYTES=2000000
```

Provider API keys already used by the runner are also used for authenticated model-list collection when the corresponding source requires them.

## One-shot operator collection

The same collector can be invoked without the long-running runner:

```bash
npm run collect:first-party-catalog -w @modelapse/catalog-admin
```

Required:

```text
DATABASE_URL=...
```

Optional narrowing / override:

```text
MODELAPSE_PROVIDER_SLUG=deepseek
MODELAPSE_CATALOG_SOURCE_KEY=models-api
MODELAPSE_COLLECT_FORCE=true
MODELAPSE_BUILD=<collector build id>
```

`MODELAPSE_COLLECT_FORCE=true` bypasses `next_run_at` for matching enabled sources but still uses the same claim and collection path.
