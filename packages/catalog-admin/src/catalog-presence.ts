import { Pool } from "pg";

export type CatalogPresenceEventKind =
  | "appeared_in_complete_snapshot"
  | "not_observed_in_complete_snapshot"
  | "reobserved_in_complete_snapshot";

export interface CatalogPresenceSourceRecord {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export interface CatalogPresenceRun {
  readonly runId: string;
  readonly observerSourceId: string;
  readonly sourceKey: string;
  readonly sourceTitle: string;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly status: "succeeded" | "partial";
  readonly itemCount: number;
  readonly projectedItemCount: number;
  readonly completeProjection: boolean;
  readonly source: CatalogPresenceSourceRecord;
}

export interface CatalogPresenceCurrentContext {
  readonly canonicalModel: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
  } | null;
  readonly candidate: {
    readonly id: string;
    readonly status: "discovered" | "matched" | "ignored" | "promotion_ready";
    readonly resolvedModelId: string | null;
  } | null;
}

export interface CatalogPresenceEvent {
  readonly id: string;
  readonly kind: CatalogPresenceEventKind;
  readonly remoteModelId: string;
  readonly observerSourceId: string;
  readonly sourceKey: string;
  readonly occurredAt: string;
  readonly runId: string;
  readonly previousCompleteRunId: string | null;
  readonly currentContext: CatalogPresenceCurrentContext;
  readonly interpretation:
    | "observed_in_complete_model_list_evidence"
    | "not_observed_in_complete_model_list_evidence"
    | "observed_again_after_complete_snapshot_absence";
}

export interface CatalogPresenceHistory {
  readonly generatedAt: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly summary: {
    readonly modelListSources: number;
    readonly evidenceRuns: number;
    readonly completeProjectionRuns: number;
    readonly incompleteProjectionRuns: number;
    readonly appearanceEvents: number;
    readonly absenceEvents: number;
    readonly reappearanceEvents: number;
    readonly latestCompleteAt: string | null;
  };
  readonly sources: readonly {
    readonly id: string;
    readonly sourceKey: string;
    readonly title: string;
    readonly url: string;
    readonly enabled: boolean;
    readonly evidenceRuns: number;
    readonly completeProjectionRuns: number;
    readonly latestCompleteAt: string | null;
  }[];
  readonly runs: readonly CatalogPresenceRun[];
  readonly events: readonly CatalogPresenceEvent[];
}

interface RunRow {
  run_id: string;
  observer_source_id: string;
  source_key: string;
  source_title: string;
  started_at: Date;
  completed_at: Date | null;
  status: "succeeded" | "partial";
  item_count: number;
  source_record_id: string;
  source_type: string;
  source_url: string | null;
  source_record_title: string | null;
  source_retrieved_at: Date;
  source_content_sha256: string | null;
}

function normalizedLimit(value: number | undefined): number {
  const limit = value ?? 30;
  if (!Number.isInteger(limit) || limit < 2 || limit > 100) {
    throw new Error("Catalog presence run limit must be an integer between 2 and 100");
  }
  return limit;
}

function eventInterpretation(
  kind: CatalogPresenceEventKind,
): CatalogPresenceEvent["interpretation"] {
  if (kind === "not_observed_in_complete_snapshot") {
    return "not_observed_in_complete_model_list_evidence";
  }
  if (kind === "reobserved_in_complete_snapshot") {
    return "observed_again_after_complete_snapshot_absence";
  }
  return "observed_in_complete_model_list_evidence";
}

export class PgCatalogPresence {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgCatalogPresence {
    return new PgCatalogPresence(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getProvider(
    providerId: string,
    options: { readonly runLimit?: number } = {},
  ): Promise<CatalogPresenceHistory | null> {
    const runLimit = normalizedLimit(options.runLimit);
    const [clock, providerResult, sourceResult] = await Promise.all([
      this.pool.query<{ generated_at: Date }>("SELECT now() AS generated_at"),
      this.pool.query<{ id: string; slug: string; name: string }>(
        `SELECT id, slug, name
           FROM modelapse.providers
          WHERE id = $1`,
        [providerId],
      ),
      this.pool.query<{
        id: string;
        source_key: string;
        title: string;
        url: string;
        enabled: boolean;
      }>(
        `SELECT id, source_key, title, url, enabled
           FROM modelapse.catalog_observer_sources
          WHERE provider_id = $1
            AND source_kind = 'model_list'
          ORDER BY source_key, id`,
        [providerId],
      ),
    ]);

    const provider = providerResult.rows[0];
    if (!provider) return null;

    const sourceIds = sourceResult.rows.map((source) => source.id);
    if (sourceIds.length === 0) {
      return {
        generatedAt:
          clock.rows[0]?.generated_at.toISOString() ?? new Date().toISOString(),
        provider,
        summary: {
          modelListSources: 0,
          evidenceRuns: 0,
          completeProjectionRuns: 0,
          incompleteProjectionRuns: 0,
          appearanceEvents: 0,
          absenceEvents: 0,
          reappearanceEvents: 0,
          latestCompleteAt: null,
        },
        sources: [],
        runs: [],
        events: [],
      };
    }

    const runResult = await this.pool.query<RunRow>(
      `WITH ranked AS (
         SELECT
           run.id AS run_id,
           run.observer_source_id,
           observer.source_key,
           observer.title AS source_title,
           run.started_at,
           run.completed_at,
           run.status,
           run.item_count,
           snapshot.source_record_id,
           source.source_type,
           source.url AS source_url,
           source.title AS source_record_title,
           source.retrieved_at AS source_retrieved_at,
           source.content_sha256 AS source_content_sha256,
           row_number() OVER (
             PARTITION BY run.observer_source_id
             ORDER BY run.started_at DESC, run.id DESC
           ) AS source_rank
         FROM modelapse.catalog_collection_runs run
         JOIN modelapse.catalog_observer_sources observer
           ON observer.id = run.observer_source_id
         JOIN modelapse.catalog_source_snapshots snapshot
           ON snapshot.collection_run_id = run.id
         JOIN modelapse.source_records source
           ON source.id = snapshot.source_record_id
        WHERE run.observer_source_id = ANY($1::uuid[])
          AND run.status IN ('succeeded', 'partial')
          AND run.item_count IS NOT NULL
       )
       SELECT
         run_id,
         observer_source_id,
         source_key,
         source_title,
         started_at,
         completed_at,
         status,
         item_count,
         source_record_id,
         source_type,
         source_url,
         source_record_title,
         source_retrieved_at,
         source_content_sha256
       FROM ranked
      WHERE source_rank <= $2
      ORDER BY observer_source_id, started_at, run_id`,
      [sourceIds, runLimit],
    );

    const runIds = runResult.rows.map((run) => run.run_id);
    const sourceRecordIds = runResult.rows.map((run) => run.source_record_id);

    const [aliasResult, discoveryResult] = await Promise.all([
      sourceRecordIds.length === 0
        ? Promise.resolve({ rows: [] as { run_id: string; remote_model_id: string }[] })
        : this.pool.query<{ run_id: string; remote_model_id: string }>(
            `SELECT
               snapshot.collection_run_id AS run_id,
               alias.alias AS remote_model_id
             FROM modelapse.alias_resolution_events event
             JOIN modelapse.model_aliases alias ON alias.id = event.alias_id
             JOIN modelapse.catalog_source_snapshots snapshot
               ON snapshot.source_record_id = event.source_id
            WHERE event.source_id = ANY($1::uuid[])
              AND alias.provider_id = $2
              AND event.source_type = 'provider_catalog'
            ORDER BY snapshot.collection_run_id, alias.alias`,
            [sourceRecordIds, providerId],
          ),
      runIds.length === 0
        ? Promise.resolve({ rows: [] as { run_id: string; remote_model_id: string }[] })
        : this.pool.query<{ run_id: string; remote_model_id: string }>(
            `SELECT
               observation.collection_run_id AS run_id,
               candidate.remote_model_id
             FROM modelapse.catalog_discovery_observations observation
             JOIN modelapse.catalog_discovery_candidates candidate
               ON candidate.id = observation.candidate_id
            WHERE observation.collection_run_id = ANY($1::uuid[])
              AND candidate.provider_id = $2
            ORDER BY observation.collection_run_id, candidate.remote_model_id`,
            [runIds, providerId],
          ),
    ]);

    const idsByRun = new Map<string, Set<string>>();
    const addRemote = (runId: string, remoteModelId: string): void => {
      const ids = idsByRun.get(runId) ?? new Set<string>();
      ids.add(remoteModelId);
      idsByRun.set(runId, ids);
    };
    for (const row of aliasResult.rows) addRemote(row.run_id, row.remote_model_id);
    for (const row of discoveryResult.rows) addRemote(row.run_id, row.remote_model_id);

    const runs: CatalogPresenceRun[] = runResult.rows.map((row) => {
      const projectedItemCount = idsByRun.get(row.run_id)?.size ?? 0;
      return {
        runId: row.run_id,
        observerSourceId: row.observer_source_id,
        sourceKey: row.source_key,
        sourceTitle: row.source_title,
        startedAt: row.started_at.toISOString(),
        completedAt: row.completed_at?.toISOString() ?? null,
        status: row.status,
        itemCount: row.item_count,
        projectedItemCount,
        completeProjection: projectedItemCount === row.item_count,
        source: {
          id: row.source_record_id,
          sourceType: row.source_type,
          url: row.source_url,
          title: row.source_record_title,
          retrievedAt: row.source_retrieved_at.toISOString(),
          contentSha256: row.source_content_sha256,
        },
      };
    });

    type DraftEvent = Omit<CatalogPresenceEvent, "currentContext">;
    const draftEvents: DraftEvent[] = [];
    const runsBySource = new Map<string, CatalogPresenceRun[]>();
    for (const run of runs) {
      const sourceRuns = runsBySource.get(run.observerSourceId) ?? [];
      sourceRuns.push(run);
      runsBySource.set(run.observerSourceId, sourceRuns);
    }

    for (const [observerSourceId, sourceRuns] of runsBySource) {
      const completeRuns = sourceRuns.filter((run) => run.completeProjection);
      let previousRun: CatalogPresenceRun | null = null;
      let previousIds = new Set<string>();
      const previouslyObserved = new Set<string>();

      for (const run of completeRuns) {
        const currentIds = idsByRun.get(run.runId) ?? new Set<string>();

        for (const remoteModelId of [...currentIds].sort()) {
          if (!previousIds.has(remoteModelId)) {
            const kind: CatalogPresenceEventKind = previouslyObserved.has(remoteModelId)
              ? "reobserved_in_complete_snapshot"
              : "appeared_in_complete_snapshot";
            draftEvents.push({
              id: [observerSourceId, run.runId, kind, remoteModelId].join(":"),
              kind,
              remoteModelId,
              observerSourceId,
              sourceKey: run.sourceKey,
              occurredAt: run.source.retrievedAt,
              runId: run.runId,
              previousCompleteRunId: previousRun?.runId ?? null,
              interpretation: eventInterpretation(kind),
            });
          }
        }

        if (previousRun) {
          for (const remoteModelId of [...previousIds].sort()) {
            if (!currentIds.has(remoteModelId)) {
              const kind: CatalogPresenceEventKind =
                "not_observed_in_complete_snapshot";
              draftEvents.push({
                id: [observerSourceId, run.runId, kind, remoteModelId].join(":"),
                kind,
                remoteModelId,
                observerSourceId,
                sourceKey: run.sourceKey,
                occurredAt: run.source.retrievedAt,
                runId: run.runId,
                previousCompleteRunId: previousRun.runId,
                interpretation: eventInterpretation(kind),
              });
            }
          }
        }

        for (const remoteModelId of currentIds) previouslyObserved.add(remoteModelId);
        previousRun = run;
        previousIds = new Set(currentIds);
      }
    }

    const eventRemoteIds = [...new Set(draftEvents.map((event) => event.remoteModelId))];
    const contextResult =
      eventRemoteIds.length === 0
        ? { rows: [] as {
            remote_model_id: string;
            model_id: string | null;
            canonical_slug: string | null;
            marketing_name: string | null;
            candidate_id: string | null;
            candidate_status: "discovered" | "matched" | "ignored" | "promotion_ready" | null;
            candidate_resolved_model_id: string | null;
          }[] }
        : await this.pool.query<{
            remote_model_id: string;
            model_id: string | null;
            canonical_slug: string | null;
            marketing_name: string | null;
            candidate_id: string | null;
            candidate_status: "discovered" | "matched" | "ignored" | "promotion_ready" | null;
            candidate_resolved_model_id: string | null;
          }>(
            `WITH remote(remote_model_id) AS (
               SELECT unnest($1::text[])
             )
             SELECT
               remote.remote_model_id,
               latest_alias.model_id,
               latest_alias.canonical_slug,
               latest_alias.marketing_name,
               candidate.id AS candidate_id,
               candidate.status AS candidate_status,
               candidate.resolved_model_id AS candidate_resolved_model_id
             FROM remote
             LEFT JOIN LATERAL (
               SELECT model.id AS model_id, model.canonical_slug, model.marketing_name
                 FROM modelapse.model_aliases alias
                 JOIN modelapse.alias_resolution_events event
                   ON event.alias_id = alias.id
                 JOIN modelapse.models model
                   ON model.id = event.resolved_model_id
                WHERE alias.provider_id = $2
                  AND alias.alias = remote.remote_model_id
                ORDER BY event.observed_at DESC, event.id DESC
                LIMIT 1
             ) latest_alias ON true
             LEFT JOIN modelapse.catalog_discovery_candidates candidate
               ON candidate.provider_id = $2
              AND candidate.remote_model_id = remote.remote_model_id
             ORDER BY remote.remote_model_id`,
            [eventRemoteIds, providerId],
          );

    const contextByRemote = new Map<
      string,
      CatalogPresenceCurrentContext
    >();
    for (const row of contextResult.rows) {
      contextByRemote.set(row.remote_model_id, {
        canonicalModel:
          row.model_id && row.canonical_slug && row.marketing_name
            ? {
                id: row.model_id,
                canonicalSlug: row.canonical_slug,
                marketingName: row.marketing_name,
              }
            : null,
        candidate:
          row.candidate_id && row.candidate_status
            ? {
                id: row.candidate_id,
                status: row.candidate_status,
                resolvedModelId: row.candidate_resolved_model_id,
              }
            : null,
      });
    }

    const events: CatalogPresenceEvent[] = draftEvents
      .map((event) => ({
        ...event,
        currentContext:
          contextByRemote.get(event.remoteModelId) ?? {
            canonicalModel: null,
            candidate: null,
          },
      }))
      .sort((a, b) => {
        const byTime = b.occurredAt.localeCompare(a.occurredAt);
        if (byTime !== 0) return byTime;
        const bySource = a.sourceKey.localeCompare(b.sourceKey);
        return bySource !== 0
          ? bySource
          : a.remoteModelId.localeCompare(b.remoteModelId);
      });

    const sourceSummaries = sourceResult.rows.map((source) => {
      const sourceRuns = runsBySource.get(source.id) ?? [];
      const completeRuns = sourceRuns.filter((run) => run.completeProjection);
      return {
        id: source.id,
        sourceKey: source.source_key,
        title: source.title,
        url: source.url,
        enabled: source.enabled,
        evidenceRuns: sourceRuns.length,
        completeProjectionRuns: completeRuns.length,
        latestCompleteAt:
          completeRuns.map((run) => run.source.retrievedAt).sort().at(-1) ?? null,
      };
    });

    const completeRuns = runs.filter((run) => run.completeProjection);
    return {
      generatedAt:
        clock.rows[0]?.generated_at.toISOString() ?? new Date().toISOString(),
      provider,
      summary: {
        modelListSources: sourceSummaries.length,
        evidenceRuns: runs.length,
        completeProjectionRuns: completeRuns.length,
        incompleteProjectionRuns: runs.length - completeRuns.length,
        appearanceEvents: events.filter(
          (event) => event.kind === "appeared_in_complete_snapshot",
        ).length,
        absenceEvents: events.filter(
          (event) => event.kind === "not_observed_in_complete_snapshot",
        ).length,
        reappearanceEvents: events.filter(
          (event) => event.kind === "reobserved_in_complete_snapshot",
        ).length,
        latestCompleteAt:
          completeRuns.map((run) => run.source.retrievedAt).sort().at(-1) ?? null,
      },
      sources: sourceSummaries,
      runs,
      events,
    };
  }
}
