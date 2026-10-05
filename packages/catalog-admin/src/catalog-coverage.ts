import { Pool } from "pg";

export type CatalogCoverageDisposition =
  | "canonical_observed"
  | "candidate_discovered"
  | "candidate_promotion_ready"
  | "candidate_ignored"
  | "candidate_matched";

export interface CatalogCoverageSourceRecord {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export interface CatalogCoverageSource {
  readonly id: string;
  readonly sourceKey: string;
  readonly url: string;
  readonly title: string;
  readonly enabled: boolean;
  readonly latestAttempt: {
    readonly runId: string;
    readonly status: string;
    readonly startedAt: string;
    readonly completedAt: string | null;
  } | null;
  readonly latestEvidence: {
    readonly runId: string;
    readonly status: "succeeded" | "partial";
    readonly startedAt: string;
    readonly completedAt: string | null;
    readonly itemCount: number;
    readonly observationsEmitted: number;
    readonly source: CatalogCoverageSourceRecord;
    readonly projectedItemCount: number;
    readonly unprojectedItemCount: number;
  } | null;
}

export interface CatalogCoverageObservationRef {
  readonly observerSourceId: string;
  readonly runId: string;
  readonly sourceRecordId: string;
  readonly observedAt: string;
  readonly providerSnapshotId: string | null;
}

export interface CatalogCoverageRemoteItem {
  readonly remoteModelId: string;
  readonly disposition: CatalogCoverageDisposition;
  readonly observations: readonly CatalogCoverageObservationRef[];
  readonly canonicalModel: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
  } | null;
  readonly candidate: {
    readonly id: string;
    readonly status: "discovered" | "promotion_ready" | "ignored" | "matched";
    readonly observationCount: number;
    readonly resolvedModel: {
      readonly id: string;
      readonly canonicalSlug: string;
      readonly marketingName: string;
    } | null;
  } | null;
}

export interface CatalogCoverageMissingBinding {
  readonly bindingId: string;
  readonly apiModelId: string;
  readonly model: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
  };
  readonly endpointHostname: string;
  readonly source: CatalogCoverageSourceRecord;
  readonly interpretation: "not_observed_in_latest_model_list_evidence";
}

export interface CatalogProviderCoverage {
  readonly generatedAt: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly summary: {
    readonly modelListSources: number;
    readonly sourcesWithEvidence: number;
    readonly sourceItemCount: number;
    readonly uniqueProjectedRemoteIds: number;
    readonly canonicalObserved: number;
    readonly candidateDiscovered: number;
    readonly candidatePromotionReady: number;
    readonly candidateIgnored: number;
    readonly candidateMatched: number;
    readonly unprojectedSourceItems: number;
    readonly currentBindingsNotObserved: number;
  };
  readonly sources: readonly CatalogCoverageSource[];
  readonly remoteItems: readonly CatalogCoverageRemoteItem[];
  readonly currentBindingsNotObserved: readonly CatalogCoverageMissingBinding[];
}

export interface CatalogProviderCoverageSummary {
  readonly provider: CatalogProviderCoverage["provider"];
  readonly generatedAt: string;
  readonly latestEvidenceAt: string | null;
  readonly summary: CatalogProviderCoverage["summary"];
}

interface SourceRow {
  id: string;
  source_key: string;
  url: string;
  title: string;
  enabled: boolean;
  latest_attempt_id: string | null;
  latest_attempt_status: string | null;
  latest_attempt_started_at: Date | null;
  latest_attempt_completed_at: Date | null;
  evidence_run_id: string | null;
  evidence_status: "succeeded" | "partial" | null;
  evidence_started_at: Date | null;
  evidence_completed_at: Date | null;
  evidence_item_count: number | null;
  evidence_observations_emitted: number | null;
  evidence_source_record_id: string | null;
  evidence_source_type: string | null;
  evidence_source_url: string | null;
  evidence_source_title: string | null;
  evidence_source_retrieved_at: Date | null;
  evidence_source_content_sha256: string | null;
}

function candidateDisposition(
  status: "discovered" | "promotion_ready" | "ignored" | "matched",
): CatalogCoverageDisposition {
  if (status === "promotion_ready") return "candidate_promotion_ready";
  if (status === "ignored") return "candidate_ignored";
  if (status === "matched") return "candidate_matched";
  return "candidate_discovered";
}

export class PgCatalogCoverage {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgCatalogCoverage {
    return new PgCatalogCoverage(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async listProviders(): Promise<readonly CatalogProviderCoverageSummary[]> {
    const providers = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
    }>(
      `SELECT id, slug, name
         FROM modelapse.providers
        ORDER BY slug`,
    );

    const details = await Promise.all(
      providers.rows.map((provider) => this.getProvider(provider.id)),
    );

    return details
      .filter(
        (detail): detail is CatalogProviderCoverage => detail !== null,
      )
      .map((detail) => ({
        provider: detail.provider,
        generatedAt: detail.generatedAt,
        latestEvidenceAt:
          detail.sources
            .map((source) => source.latestEvidence?.source.retrievedAt ?? null)
            .filter((value): value is string => value !== null)
            .sort()
            .at(-1) ?? null,
        summary: detail.summary,
      }));
  }

  async getProvider(providerId: string): Promise<CatalogProviderCoverage | null> {
    const [clock, providerResult] = await Promise.all([
      this.pool.query<{ generated_at: Date }>("SELECT now() AS generated_at"),
      this.pool.query<{ id: string; slug: string; name: string }>(
        `SELECT id, slug, name
           FROM modelapse.providers
          WHERE id = $1`,
        [providerId],
      ),
    ]);

    const provider = providerResult.rows[0];
    if (!provider) return null;

    const sourceResult = await this.pool.query<SourceRow>(
      `SELECT
         observer.id,
         observer.source_key,
         observer.url,
         observer.title,
         observer.enabled,
         attempt.id AS latest_attempt_id,
         attempt.status AS latest_attempt_status,
         attempt.started_at AS latest_attempt_started_at,
         attempt.completed_at AS latest_attempt_completed_at,
         evidence.run_id AS evidence_run_id,
         evidence.status AS evidence_status,
         evidence.started_at AS evidence_started_at,
         evidence.completed_at AS evidence_completed_at,
         evidence.item_count AS evidence_item_count,
         evidence.observations_emitted AS evidence_observations_emitted,
         evidence.source_record_id AS evidence_source_record_id,
         evidence.source_type AS evidence_source_type,
         evidence.source_url AS evidence_source_url,
         evidence.source_title AS evidence_source_title,
         evidence.source_retrieved_at AS evidence_source_retrieved_at,
         evidence.source_content_sha256 AS evidence_source_content_sha256
       FROM modelapse.catalog_observer_sources observer
       LEFT JOIN LATERAL (
         SELECT run.id, run.status, run.started_at, run.completed_at
           FROM modelapse.catalog_collection_runs run
          WHERE run.observer_source_id = observer.id
          ORDER BY run.started_at DESC, run.id DESC
          LIMIT 1
       ) attempt ON true
       LEFT JOIN LATERAL (
         SELECT
           run.id AS run_id,
           run.status,
           run.started_at,
           run.completed_at,
           run.item_count,
           run.observations_emitted,
           source.id AS source_record_id,
           source.source_type,
           source.url AS source_url,
           source.title AS source_title,
           source.retrieved_at AS source_retrieved_at,
           source.content_sha256 AS source_content_sha256
         FROM modelapse.catalog_collection_runs run
         JOIN modelapse.catalog_source_snapshots snapshot
           ON snapshot.collection_run_id = run.id
         JOIN modelapse.source_records source
           ON source.id = snapshot.source_record_id
        WHERE run.observer_source_id = observer.id
          AND run.status IN ('succeeded', 'partial')
          AND run.item_count IS NOT NULL
        ORDER BY run.started_at DESC, run.id DESC
        LIMIT 1
       ) evidence ON true
      WHERE observer.provider_id = $1
        AND observer.source_kind = 'model_list'
      ORDER BY observer.source_key, observer.id`,
      [providerId],
    );

    const evidenceSources = sourceResult.rows.filter(
      (row) =>
        row.evidence_run_id !== null &&
        row.evidence_source_record_id !== null &&
        row.evidence_source_retrieved_at !== null &&
        row.evidence_status !== null &&
        row.evidence_item_count !== null,
    );
    const evidenceRunIds = evidenceSources.map((row) => row.evidence_run_id!);
    const sourceRecordIds = evidenceSources.map(
      (row) => row.evidence_source_record_id!,
    );

    const [aliasResult, candidateResult, bindingResult] = await Promise.all([
      sourceRecordIds.length === 0
        ? Promise.resolve({ rows: [] as {
            observer_source_id: string;
            run_id: string;
            source_record_id: string;
            remote_model_id: string;
            observed_at: Date;
            provider_snapshot_id: string | null;
            model_id: string;
            canonical_slug: string;
            marketing_name: string;
          }[] })
        : this.pool.query<{
            observer_source_id: string;
            run_id: string;
            source_record_id: string;
            remote_model_id: string;
            observed_at: Date;
            provider_snapshot_id: string | null;
            model_id: string;
            canonical_slug: string;
            marketing_name: string;
          }>(
            `SELECT
               snapshot.observer_source_id,
               snapshot.collection_run_id AS run_id,
               event.source_id AS source_record_id,
               alias.alias AS remote_model_id,
               event.observed_at,
               model_snapshot.provider_snapshot_id,
               model.id AS model_id,
               model.canonical_slug,
               model.marketing_name
             FROM modelapse.alias_resolution_events event
             JOIN modelapse.model_aliases alias ON alias.id = event.alias_id
             JOIN modelapse.models model ON model.id = event.resolved_model_id
             LEFT JOIN modelapse.model_snapshots model_snapshot
               ON model_snapshot.id = event.resolved_snapshot_id
             JOIN modelapse.catalog_source_snapshots snapshot
               ON snapshot.source_record_id = event.source_id
            WHERE event.source_id = ANY($1::uuid[])
              AND alias.provider_id = $2
              AND event.source_type = 'provider_catalog'
            ORDER BY event.observed_at, event.id`,
            [sourceRecordIds, providerId],
          ),
      evidenceRunIds.length === 0
        ? Promise.resolve({ rows: [] as {
            observer_source_id: string;
            run_id: string;
            source_record_id: string;
            remote_model_id: string;
            observed_at: Date;
            provider_snapshot_id: string | null;
            candidate_id: string;
            candidate_status: "discovered" | "promotion_ready" | "ignored" | "matched";
            observation_count: string;
            resolved_model_id: string | null;
            resolved_canonical_slug: string | null;
            resolved_marketing_name: string | null;
          }[] })
        : this.pool.query<{
            observer_source_id: string;
            run_id: string;
            source_record_id: string;
            remote_model_id: string;
            observed_at: Date;
            provider_snapshot_id: string | null;
            candidate_id: string;
            candidate_status: "discovered" | "promotion_ready" | "ignored" | "matched";
            observation_count: string;
            resolved_model_id: string | null;
            resolved_canonical_slug: string | null;
            resolved_marketing_name: string | null;
          }>(
            `SELECT
               snapshot.observer_source_id,
               observation.collection_run_id AS run_id,
               observation.source_record_id,
               candidate.remote_model_id,
               observation.observed_at,
               observation.provider_snapshot_id,
               candidate.id AS candidate_id,
               candidate.status AS candidate_status,
               candidate.observation_count::text,
               resolved.id AS resolved_model_id,
               resolved.canonical_slug AS resolved_canonical_slug,
               resolved.marketing_name AS resolved_marketing_name
             FROM modelapse.catalog_discovery_observations observation
             JOIN modelapse.catalog_discovery_candidates candidate
               ON candidate.id = observation.candidate_id
             JOIN modelapse.catalog_source_snapshots snapshot
               ON snapshot.collection_run_id = observation.collection_run_id
             LEFT JOIN modelapse.models resolved
               ON resolved.id = candidate.resolved_model_id
            WHERE observation.collection_run_id = ANY($1::uuid[])
              AND candidate.provider_id = $2
            ORDER BY observation.observed_at, observation.id`,
            [evidenceRunIds, providerId],
          ),
      this.pool.query<{
        binding_id: string;
        api_model_id: string;
        endpoint_hostname: string;
        model_id: string;
        canonical_slug: string;
        marketing_name: string;
        source_id: string;
        source_type: string;
        source_url: string | null;
        source_title: string | null;
        source_retrieved_at: Date;
        source_content_sha256: string | null;
      }>(
        `SELECT
           binding.id AS binding_id,
           binding.api_model_id,
           endpoint.hostname AS endpoint_hostname,
           model.id AS model_id,
           model.canonical_slug,
           model.marketing_name,
           source.id AS source_id,
           source.source_type,
           source.url AS source_url,
           source.title AS source_title,
           source.retrieved_at AS source_retrieved_at,
           source.content_sha256 AS source_content_sha256
         FROM modelapse.models model
         JOIN modelapse.model_execution_bindings binding
           ON binding.model_id = model.id
          AND binding.valid_to IS NULL
         JOIN modelapse.provider_endpoints endpoint
           ON endpoint.id = binding.endpoint_id
          AND endpoint.path = 'first_party_direct'
         JOIN modelapse.source_records source ON source.id = binding.source_id
        WHERE model.provider_id = $1
        ORDER BY model.canonical_slug, binding.api_model_id, binding.id`,
        [providerId],
      ),
    ]);

    type MutableRemote = {
      remoteModelId: string;
      canonicalModel: CatalogCoverageRemoteItem["canonicalModel"];
      candidate: CatalogCoverageRemoteItem["candidate"];
      observations: CatalogCoverageObservationRef[];
    };

    const remoteById = new Map<string, MutableRemote>();
    const ensureRemote = (remoteModelId: string): MutableRemote => {
      const existing = remoteById.get(remoteModelId);
      if (existing) return existing;
      const created: MutableRemote = {
        remoteModelId,
        canonicalModel: null,
        candidate: null,
        observations: [],
      };
      remoteById.set(remoteModelId, created);
      return created;
    };

    for (const row of aliasResult.rows) {
      const remote = ensureRemote(row.remote_model_id);
      remote.canonicalModel = {
        id: row.model_id,
        canonicalSlug: row.canonical_slug,
        marketingName: row.marketing_name,
      };
      remote.observations.push({
        observerSourceId: row.observer_source_id,
        runId: row.run_id,
        sourceRecordId: row.source_record_id,
        observedAt: row.observed_at.toISOString(),
        providerSnapshotId: row.provider_snapshot_id,
      });
    }

    for (const row of candidateResult.rows) {
      const remote = ensureRemote(row.remote_model_id);
      remote.candidate = {
        id: row.candidate_id,
        status: row.candidate_status,
        observationCount: Number(row.observation_count),
        resolvedModel:
          row.resolved_model_id &&
          row.resolved_canonical_slug &&
          row.resolved_marketing_name
            ? {
                id: row.resolved_model_id,
                canonicalSlug: row.resolved_canonical_slug,
                marketingName: row.resolved_marketing_name,
              }
            : null,
      };
      remote.observations.push({
        observerSourceId: row.observer_source_id,
        runId: row.run_id,
        sourceRecordId: row.source_record_id,
        observedAt: row.observed_at.toISOString(),
        providerSnapshotId: row.provider_snapshot_id,
      });
    }

    const remoteItems: CatalogCoverageRemoteItem[] = [...remoteById.values()]
      .map((remote) => ({
        remoteModelId: remote.remoteModelId,
        disposition: remote.canonicalModel
          ? ("canonical_observed" as const)
          : candidateDisposition(remote.candidate?.status ?? "discovered"),
        observations: remote.observations.sort((a, b) =>
          a.observedAt.localeCompare(b.observedAt),
        ),
        canonicalModel: remote.canonicalModel,
        candidate: remote.candidate,
      }))
      .sort((a, b) => a.remoteModelId.localeCompare(b.remoteModelId));

    const projectedIdsByRun = new Map<string, Set<string>>();
    for (const item of remoteItems) {
      for (const observation of item.observations) {
        const ids = projectedIdsByRun.get(observation.runId) ?? new Set<string>();
        ids.add(item.remoteModelId);
        projectedIdsByRun.set(observation.runId, ids);
      }
    }

    const sources: CatalogCoverageSource[] = sourceResult.rows.map((row) => {
      const projectedItemCount = row.evidence_run_id
        ? projectedIdsByRun.get(row.evidence_run_id)?.size ?? 0
        : 0;
      return {
        id: row.id,
        sourceKey: row.source_key,
        url: row.url,
        title: row.title,
        enabled: row.enabled,
        latestAttempt:
          row.latest_attempt_id &&
          row.latest_attempt_status &&
          row.latest_attempt_started_at
            ? {
                runId: row.latest_attempt_id,
                status: row.latest_attempt_status,
                startedAt: row.latest_attempt_started_at.toISOString(),
                completedAt: row.latest_attempt_completed_at?.toISOString() ?? null,
              }
            : null,
        latestEvidence:
          row.evidence_run_id &&
          row.evidence_status &&
          row.evidence_started_at &&
          row.evidence_item_count !== null &&
          row.evidence_source_record_id &&
          row.evidence_source_type &&
          row.evidence_source_retrieved_at
            ? {
                runId: row.evidence_run_id,
                status: row.evidence_status,
                startedAt: row.evidence_started_at.toISOString(),
                completedAt: row.evidence_completed_at?.toISOString() ?? null,
                itemCount: row.evidence_item_count,
                observationsEmitted: row.evidence_observations_emitted ?? 0,
                source: {
                  id: row.evidence_source_record_id,
                  sourceType: row.evidence_source_type,
                  url: row.evidence_source_url,
                  title: row.evidence_source_title,
                  retrievedAt: row.evidence_source_retrieved_at.toISOString(),
                  contentSha256: row.evidence_source_content_sha256,
                },
                projectedItemCount,
                unprojectedItemCount: Math.max(
                  row.evidence_item_count - projectedItemCount,
                  0,
                ),
              }
            : null,
      };
    });

    const projectedRemoteIds = new Set(remoteItems.map((item) => item.remoteModelId));
    const currentBindingsNotObserved: CatalogCoverageMissingBinding[] =
      evidenceSources.length === 0
        ? []
        : bindingResult.rows
        .filter((row) => !projectedRemoteIds.has(row.api_model_id))
        .map((row) => ({
          bindingId: row.binding_id,
          apiModelId: row.api_model_id,
          model: {
            id: row.model_id,
            canonicalSlug: row.canonical_slug,
            marketingName: row.marketing_name,
          },
          endpointHostname: row.endpoint_hostname,
          source: {
            id: row.source_id,
            sourceType: row.source_type,
            url: row.source_url,
            title: row.source_title,
            retrievedAt: row.source_retrieved_at.toISOString(),
            contentSha256: row.source_content_sha256,
          },
          interpretation: "not_observed_in_latest_model_list_evidence" as const,
        }));

    const dispositionCount = (disposition: CatalogCoverageDisposition) =>
      remoteItems.filter((item) => item.disposition === disposition).length;

    return {
      generatedAt:
        clock.rows[0]?.generated_at.toISOString() ?? new Date().toISOString(),
      provider: {
        id: provider.id,
        slug: provider.slug,
        name: provider.name,
      },
      summary: {
        modelListSources: sources.length,
        sourcesWithEvidence: sources.filter((source) => source.latestEvidence).length,
        sourceItemCount: sources.reduce(
          (sum, source) => sum + (source.latestEvidence?.itemCount ?? 0),
          0,
        ),
        uniqueProjectedRemoteIds: remoteItems.length,
        canonicalObserved: dispositionCount("canonical_observed"),
        candidateDiscovered: dispositionCount("candidate_discovered"),
        candidatePromotionReady: dispositionCount("candidate_promotion_ready"),
        candidateIgnored: dispositionCount("candidate_ignored"),
        candidateMatched: dispositionCount("candidate_matched"),
        unprojectedSourceItems: sources.reduce(
          (sum, source) =>
            sum + (source.latestEvidence?.unprojectedItemCount ?? 0),
          0,
        ),
        currentBindingsNotObserved: currentBindingsNotObserved.length,
      },
      sources,
      remoteItems,
      currentBindingsNotObserved,
    };
  }
}
