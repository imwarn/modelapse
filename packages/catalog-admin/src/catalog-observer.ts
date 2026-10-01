import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { PgModelCatalogAdmin } from "./model-catalog.js";

export type CatalogObserverSourceKind = "model_list" | "docs";
export type CatalogObserverParser = "openai_models" | "snapshot_only";
export type CatalogCollectionStatus =
  | "succeeded"
  | "partial"
  | "failed"
  | "skipped";

export interface ObservedRemoteModel {
  readonly id: string;
  readonly providerSnapshotId: string | null;
}

export interface CatalogCollectionResult {
  readonly runId: string;
  readonly sourceKey: string;
  readonly providerSlug: string;
  readonly status: CatalogCollectionStatus;
  readonly httpStatus: number | null;
  readonly contentSha256: string | null;
  readonly itemCount: number | null;
  readonly observationsEmitted: number;
  readonly error: string | null;
}

interface ObserverSource {
  readonly id: string;
  readonly providerId: string;
  readonly providerSlug: string;
  readonly sourceKey: string;
  readonly sourceKind: CatalogObserverSourceKind;
  readonly url: string;
  readonly title: string;
  readonly parser: CatalogObserverParser;
  readonly credentialEnv: string | null;
  readonly intervalSeconds: number;
}

interface KnownBinding {
  readonly canonicalSlug: string;
  readonly apiModelId: string;
  readonly providerSnapshotId: string | null;
}

type FetchLike = typeof fetch;

const DEFAULT_SOURCES = [
  {
    providerSlug: "openai",
    sourceKey: "models-api",
    sourceKind: "model_list",
    url: "https://api.openai.com/v1/models",
    title: "OpenAI Models API",
    parser: "openai_models",
    credentialEnv: "OPENAI_API_KEY",
    intervalSeconds: 21600,
  },
  {
    providerSlug: "openai",
    sourceKey: "responses-docs",
    sourceKind: "docs",
    url: "https://platform.openai.com/docs/api-reference/responses",
    title: "OpenAI Responses API reference",
    parser: "snapshot_only",
    credentialEnv: null,
    intervalSeconds: 86400,
  },
  {
    providerSlug: "deepseek",
    sourceKey: "models-api",
    sourceKind: "model_list",
    url: "https://api.deepseek.com/models",
    title: "DeepSeek Models API",
    parser: "openai_models",
    credentialEnv: "DEEPSEEK_API_KEY",
    intervalSeconds: 21600,
  },
  {
    providerSlug: "deepseek",
    sourceKey: "responses-docs",
    sourceKind: "docs",
    url: "https://api-docs.deepseek.com/guides/responses_api/",
    title: "DeepSeek Responses API guide",
    parser: "snapshot_only",
    credentialEnv: null,
    intervalSeconds: 86400,
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalSnapshotId(value: Record<string, unknown>): string | null {
  for (const key of [
    "provider_snapshot_id",
    "providerSnapshotId",
    "snapshot",
    "version",
    "model_version",
  ]) {
    const raw = value[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

export function parseOpenAICompatibleModelList(
  input: unknown,
): readonly ObservedRemoteModel[] {
  if (!isRecord(input) || !Array.isArray(input.data)) {
    throw new Error("Model-list payload must contain a data array");
  }

  const models = new Map<string, ObservedRemoteModel>();
  for (const item of input.data) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) {
      continue;
    }
    const id = item.id.trim();
    models.set(id, {
      id,
      providerSnapshotId: optionalSnapshotId(item),
    });
  }
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizedTimestamp(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("now must be an ISO-8601 timestamp");
  }
  return parsed.toISOString();
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(name + " must be a positive integer");
  }
  return resolved;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 4000);
  return String(error).slice(0, 4000);
}

function completionTimestamp(startedAt: string): string {
  return new Date(Math.max(Date.now(), Date.parse(startedAt))).toISOString();
}

async function sourceRows(
  client: PoolClient,
  input: {
    readonly providerSlug: string | null;
    readonly sourceKey: string | null;
  },
  now: string,
  limit: number,
  force: boolean,
): Promise<readonly ObserverSource[]> {
  const result = await client.query<{
    id: string;
    provider_id: string;
    provider_slug: string;
    source_key: string;
    source_kind: CatalogObserverSourceKind;
    url: string;
    title: string;
    parser: CatalogObserverParser;
    credential_env: string | null;
    interval_seconds: number;
  }>(
    `WITH due AS (
       SELECT candidate.id
         FROM modelapse.catalog_observer_sources candidate
         JOIN modelapse.providers provider
           ON provider.id = candidate.provider_id
        WHERE candidate.enabled = true
          AND ($1::text IS NULL OR provider.slug = $1)
          AND ($2::text IS NULL OR candidate.source_key = $2)
          AND ($3::boolean OR candidate.next_run_at <= $4::timestamptz)
        ORDER BY candidate.next_run_at, candidate.id
        LIMIT $5
        FOR UPDATE OF candidate SKIP LOCKED
     ),
     claimed AS (
       UPDATE modelapse.catalog_observer_sources claimed_source
          SET last_attempted_at = $4::timestamptz,
              next_run_at =
                $4::timestamptz +
                make_interval(secs => claimed_source.interval_seconds),
              updated_at = now()
         FROM due
        WHERE claimed_source.id = due.id
        RETURNING claimed_source.*
     )
     SELECT
       claimed.id,
       claimed.provider_id,
       provider.slug AS provider_slug,
       claimed.source_key,
       claimed.source_kind,
       claimed.url,
       claimed.title,
       claimed.parser,
       claimed.credential_env,
       claimed.interval_seconds
       FROM claimed
       JOIN modelapse.providers provider
         ON provider.id = claimed.provider_id
      ORDER BY claimed.next_run_at, claimed.id`,
    [input.providerSlug, input.sourceKey, force, now, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    providerId: row.provider_id,
    providerSlug: row.provider_slug,
    sourceKey: row.source_key,
    sourceKind: row.source_kind,
    url: row.url,
    title: row.title,
    parser: row.parser,
    credentialEnv: row.credential_env,
    intervalSeconds: row.interval_seconds,
  }));
}

export class PgCatalogObserver {
  private readonly fetchImpl: FetchLike;
  private readonly credentialResolver: (name: string) => string | undefined;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly modelAdmin: PgModelCatalogAdmin;

  constructor(
    private readonly pool: Pool,
    options: {
      readonly fetchImpl?: FetchLike;
      readonly credentialResolver?: (name: string) => string | undefined;
      readonly timeoutMs?: number;
      readonly maxResponseBytes?: number;
    } = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.credentialResolver =
      options.credentialResolver ?? ((name) => process.env[name]);
    this.timeoutMs = positiveInteger(
      options.timeoutMs,
      30_000,
      "Catalog observer timeout",
    );
    this.maxResponseBytes = positiveInteger(
      options.maxResponseBytes,
      2_000_000,
      "Catalog observer maxResponseBytes",
    );
    this.modelAdmin = new PgModelCatalogAdmin(pool);
  }

  static connect(
    connectionString: string,
    options: {
      readonly max?: number;
      readonly fetchImpl?: FetchLike;
      readonly credentialResolver?: (name: string) => string | undefined;
      readonly timeoutMs?: number;
      readonly maxResponseBytes?: number;
    } = {},
  ): PgCatalogObserver {
    const pool = new Pool({
      connectionString,
      max: options.max ?? 3,
    });
    return new PgCatalogObserver(pool, {
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.credentialResolver
        ? { credentialResolver: options.credentialResolver }
        : {}),
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.maxResponseBytes
        ? { maxResponseBytes: options.maxResponseBytes }
        : {}),
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ensureDefaultSources(): Promise<void> {
    for (const source of DEFAULT_SOURCES) {
      await this.pool.query(
        `INSERT INTO modelapse.catalog_observer_sources
          (
            provider_id,
            source_key,
            source_kind,
            url,
            title,
            parser,
            credential_env,
            interval_seconds
          )
         SELECT
           provider.id,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8
           FROM modelapse.providers provider
          WHERE provider.slug = $1
         ON CONFLICT (provider_id, source_key) DO NOTHING`,
        [
          source.providerSlug,
          source.sourceKey,
          source.sourceKind,
          source.url,
          source.title,
          source.parser,
          source.credentialEnv,
          source.intervalSeconds,
        ],
      );
    }
  }

  async collectDue(input: {
    readonly collectorBuild: string;
    readonly now?: string;
    readonly limit?: number;
    readonly force?: boolean;
    readonly providerSlug?: string;
    readonly sourceKey?: string;
  }): Promise<readonly CatalogCollectionResult[]> {
    const collectorBuild = input.collectorBuild.trim();
    if (!collectorBuild) throw new Error("collectorBuild is required");
    const now = normalizedTimestamp(input.now);
    const limit = input.limit ?? 4;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new Error("Catalog observer limit must be an integer between 1 and 20");
    }

    await this.ensureDefaultSources();

    const client = await this.pool.connect();
    let claimed: readonly ObserverSource[] = [];
    try {
      await client.query("BEGIN");
      claimed = await sourceRows(
        client,
        {
          providerSlug: input.providerSlug?.trim() || null,
          sourceKey: input.sourceKey?.trim() || null,
        },
        now,
        limit,
        input.force ?? false,
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const results: CatalogCollectionResult[] = [];
    for (const source of claimed) {
      results.push(await this.collectSource(source, now, collectorBuild));
    }
    return results;
  }

  private async startRun(
    sourceId: string,
    startedAt: string,
    collectorBuild: string,
  ): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO modelapse.catalog_collection_runs
        (observer_source_id, status, started_at, collector_build)
       VALUES ($1, 'running', $2, $3)
       RETURNING id`,
      [sourceId, startedAt, collectorBuild],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("Catalog collection run insert failed");
    return id;
  }

  private async finishRun(
    runId: string,
    input: {
      readonly status: CatalogCollectionStatus;
      readonly completedAt: string;
      readonly httpStatus?: number;
      readonly itemCount?: number;
      readonly observationsEmitted?: number;
      readonly error?: string;
      readonly metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.pool.query(
      `UPDATE modelapse.catalog_collection_runs
          SET status = $2,
              completed_at = $3,
              http_status = $4,
              item_count = $5,
              observations_emitted = $6,
              error_message = $7,
              metadata = $8::jsonb
        WHERE id = $1
          AND status = 'running'`,
      [
        runId,
        input.status,
        input.completedAt,
        input.httpStatus ?? null,
        input.itemCount ?? null,
        input.observationsEmitted ?? 0,
        input.error ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  private async storeSnapshot(input: {
    readonly source: ObserverSource;
    readonly runId: string;
    readonly retrievedAt: string;
    readonly collectorBuild: string;
    readonly body: string;
    readonly contentSha256: string;
    readonly contentType: string | null;
    readonly etag: string | null;
    readonly lastModified: string | null;
    readonly httpStatus: number;
  }): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const sourceType =
        input.source.sourceKind === "model_list"
          ? "provider_catalog"
          : "provider_docs";
      const sourceRecord = await client.query<{ id: string }>(
        `INSERT INTO modelapse.source_records
          (
            source_type,
            url,
            title,
            retrieved_at,
            content_sha256,
            metadata
          )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         RETURNING id`,
        [
          sourceType,
          input.source.url,
          input.source.title,
          input.retrievedAt,
          input.contentSha256,
          JSON.stringify({
            collector: "catalog-observer",
            collectorBuild: input.collectorBuild,
            observerSourceId: input.source.id,
            collectionRunId: input.runId,
            sourceKey: input.source.sourceKey,
            parser: input.source.parser,
            httpStatus: input.httpStatus,
            contentType: input.contentType,
            etag: input.etag,
            lastModified: input.lastModified,
          }),
        ],
      );
      const sourceRecordId = sourceRecord.rows[0]?.id;
      if (!sourceRecordId) {
        throw new Error("Catalog snapshot source record insert failed");
      }

      await client.query(
        `INSERT INTO modelapse.catalog_source_snapshots
          (
            observer_source_id,
            collection_run_id,
            source_record_id,
            retrieved_at,
            content_sha256,
            content_type,
            etag,
            last_modified,
            response_body
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          input.source.id,
          input.runId,
          sourceRecordId,
          input.retrievedAt,
          input.contentSha256,
          input.contentType,
          input.etag,
          input.lastModified,
          input.body,
        ],
      );
      await client.query("COMMIT");
      return sourceRecordId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async currentBindings(
    providerId: string,
  ): Promise<readonly KnownBinding[]> {
    const result = await this.pool.query<{
      canonical_slug: string;
      api_model_id: string;
      provider_snapshot_id: string | null;
    }>(
      `SELECT
         model.canonical_slug,
         binding.api_model_id,
         snapshot.provider_snapshot_id
       FROM modelapse.models model
       JOIN modelapse.model_execution_bindings binding
         ON binding.model_id = model.id
        AND binding.valid_to IS NULL
       JOIN modelapse.provider_endpoints endpoint
         ON endpoint.id = binding.endpoint_id
        AND endpoint.path = 'first_party_direct'
       LEFT JOIN modelapse.model_snapshots snapshot
         ON snapshot.id = binding.snapshot_id
      WHERE model.provider_id = $1
      ORDER BY model.canonical_slug`,
      [providerId],
    );
    return result.rows.map((row) => ({
      canonicalSlug: row.canonical_slug,
      apiModelId: row.api_model_id,
      providerSnapshotId: row.provider_snapshot_id,
    }));
  }

  private async collectSource(
    source: ObserverSource,
    observedAt: string,
    collectorBuild: string,
  ): Promise<CatalogCollectionResult> {
    const runId = await this.startRun(source.id, observedAt, collectorBuild);
    const credential = source.credentialEnv
      ? this.credentialResolver(source.credentialEnv)?.trim()
      : undefined;

    if (source.credentialEnv && !credential) {
      const error = "Missing collector credential: " + source.credentialEnv;
      await this.finishRun(runId, {
        status: "skipped",
        completedAt: completionTimestamp(observedAt),
        error,
      });
      return {
        runId,
        sourceKey: source.sourceKey,
        providerSlug: source.providerSlug,
        status: "skipped",
        httpStatus: null,
        contentSha256: null,
        itemCount: null,
        observationsEmitted: 0,
        error,
      };
    }

    let httpStatus: number | null = null;
    try {
      const headers: Record<string, string> = {
        accept:
          source.sourceKind === "model_list"
            ? "application/json"
            : "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
        "user-agent": "modelapse-catalog-observer/" + collectorBuild.slice(0, 64),
      };
      if (credential) headers.authorization = "Bearer " + credential;

      const response = await this.fetchImpl(source.url, {
        method: "GET",
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      httpStatus = response.status;
      if (!response.ok) {
        throw new Error("Catalog source returned HTTP " + response.status);
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength > this.maxResponseBytes) {
        throw new Error(
          "Catalog source exceeded max response bytes: " + bytes.byteLength,
        );
      }
      const body = bytes.toString("utf8");
      const contentSha256 = createHash("sha256").update(bytes).digest("hex");
      const contentType = response.headers.get("content-type");
      const etag = response.headers.get("etag");
      const lastModified = response.headers.get("last-modified");

      const sourceRecordId = await this.storeSnapshot({
        source,
        runId,
        retrievedAt: observedAt,
        collectorBuild,
        body,
        contentSha256,
        contentType,
        etag,
        lastModified,
        httpStatus: response.status,
      });

      if (source.parser === "snapshot_only") {
        await this.pool.query(
          `UPDATE modelapse.catalog_observer_sources
              SET last_succeeded_at = $2,
                  updated_at = now()
            WHERE id = $1`,
          [source.id, observedAt],
        );
        await this.finishRun(runId, {
          status: "succeeded",
          completedAt: completionTimestamp(observedAt),
          httpStatus: response.status,
          observationsEmitted: 0,
          metadata: { sourceRecordId, contentSha256 },
        });
        return {
          runId,
          sourceKey: source.sourceKey,
          providerSlug: source.providerSlug,
          status: "succeeded",
          httpStatus: response.status,
          contentSha256,
          itemCount: null,
          observationsEmitted: 0,
          error: null,
        };
      }

      const remoteModels = parseOpenAICompatibleModelList(JSON.parse(body));
      const remoteById = new Map(remoteModels.map((model) => [model.id, model]));
      const knownBindings = await this.currentBindings(source.providerId);
      const missingKnownApiModelIds: string[] = [];
      const matchedApiModelIds = new Set<string>();
      const observationErrors: string[] = [];
      let observationsEmitted = 0;

      for (const binding of knownBindings) {
        const remote = remoteById.get(binding.apiModelId);
        if (!remote) {
          missingKnownApiModelIds.push(binding.apiModelId);
          continue;
        }
        matchedApiModelIds.add(binding.apiModelId);
        try {
          const observedSnapshotId =
            remote.providerSnapshotId ?? binding.providerSnapshotId;
          await this.modelAdmin.observeFirstPartyIdentity({
            providerSlug: source.providerSlug,
            canonicalSlug: binding.canonicalSlug,
            apiModelId: binding.apiModelId,
            ...(observedSnapshotId
              ? { providerSnapshotId: observedSnapshotId }
              : {}),
            sourceUrl: source.url,
            sourceTitle: source.title,
            sourceType: "provider_catalog",
            sourceRecordId,
            contentSha256,
            observedAt,
            collector: "catalog-observer",
          });
          observationsEmitted += 1;
        } catch (error) {
          observationErrors.push(
            binding.canonicalSlug + ": " + safeError(error),
          );
        }
      }

      const unmatchedRemoteModelIds = remoteModels
        .map((model) => model.id)
        .filter((id) => !matchedApiModelIds.has(id))
        .slice(0, 200);
      const status: CatalogCollectionStatus =
        observationErrors.length > 0 ? "partial" : "succeeded";
      const error =
        observationErrors.length > 0
          ? observationErrors.slice(0, 20).join("; ")
          : undefined;

      await this.pool.query(
        `UPDATE modelapse.catalog_observer_sources
            SET last_succeeded_at = $2,
                updated_at = now()
          WHERE id = $1`,
        [source.id, observedAt],
      );
      await this.finishRun(runId, {
        status,
        completedAt: completionTimestamp(observedAt),
        httpStatus: response.status,
        itemCount: remoteModels.length,
        observationsEmitted,
        ...(error ? { error } : {}),
        metadata: {
          sourceRecordId,
          contentSha256,
          missingKnownApiModelIds,
          unmatchedRemoteModelIds,
        },
      });

      return {
        runId,
        sourceKey: source.sourceKey,
        providerSlug: source.providerSlug,
        status,
        httpStatus: response.status,
        contentSha256,
        itemCount: remoteModels.length,
        observationsEmitted,
        error: error ?? null,
      };
    } catch (error) {
      const message = safeError(error);
      await this.finishRun(runId, {
        status: "failed",
        completedAt: completionTimestamp(observedAt),
        ...(httpStatus === null ? {} : { httpStatus }),
        error: message,
      });
      return {
        runId,
        sourceKey: source.sourceKey,
        providerSlug: source.providerSlug,
        status: "failed",
        httpStatus,
        contentSha256: null,
        itemCount: null,
        observationsEmitted: 0,
        error: message,
      };
    }
  }
}
