import { Pool } from "pg";
import {
  PgCatalogDiscovery,
  type CatalogDiscoveryCandidate,
} from "./catalog-discovery.js";
import {
  PgCatalogDriftReview,
  type CatalogDriftReviewItem,
} from "./catalog-drift-review.js";

export type CatalogIntegrityCategory =
  | "collection_failed"
  | "collection_partial"
  | "collection_stale"
  | "discovery_unresolved"
  | "promotion_ready"
  | "promotion_blocked"
  | "drift_open"
  | "drift_acknowledged"
  | "provenance_incomplete";

export interface CatalogIntegritySummary {
  readonly total: number;
  readonly counts: Readonly<Record<CatalogIntegrityCategory, number>>;
}

export interface CatalogIntegrityObserverSource {
  readonly id: string;
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly sourceKey: string;
  readonly sourceKind: string;
  readonly url: string;
  readonly title: string;
  readonly enabled: boolean;
  readonly intervalSeconds: number;
  readonly lastAttemptedAt: string | null;
  readonly lastSucceededAt: string | null;
  readonly nextRunAt: string;
  readonly health: "disabled" | "healthy" | "never_collected" | "failed" | "partial" | "stale";
  readonly attentionCategory: "collection_failed" | "collection_partial" | "collection_stale" | null;
  readonly latestRun: {
    readonly id: string;
    readonly status: string;
    readonly startedAt: string;
    readonly completedAt: string | null;
    readonly httpStatus: number | null;
    readonly itemCount: number | null;
    readonly observationsEmitted: number;
  } | null;
}

export interface CatalogIntegrityDiscoveryItem {
  readonly candidateId: string;
  readonly provider: CatalogDiscoveryCandidate["provider"];
  readonly remoteModelId: string;
  readonly status: CatalogDiscoveryCandidate["status"];
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly observationCount: number;
  readonly latestProviderSnapshotId: string | null;
  readonly attentionCategory: "discovery_unresolved" | "promotion_ready" | "promotion_blocked";
  readonly promotionPolicy: {
    readonly version: string;
    readonly eligible: boolean;
    readonly blockers: readonly string[];
  };
  readonly latestFirstPartySource: {
    readonly id: string;
    readonly sourceType: string;
    readonly url: string | null;
    readonly title: string | null;
    readonly retrievedAt: string;
    readonly contentSha256: string | null;
  };
}

export interface CatalogIntegrityDriftItem {
  readonly eventId: string;
  readonly attentionCategory: "drift_open" | "drift_acknowledged";
  readonly changeType: string;
  readonly occurredAt: string;
  readonly provider: CatalogDriftReviewItem["provider"];
  readonly model: CatalogDriftReviewItem["model"];
  readonly alias: string | null;
  readonly previousApiModelId: string | null;
  readonly currentApiModelId: string | null;
  readonly changedFields: readonly string[];
  readonly evidenceSource: CatalogDriftReviewItem["currentSource"];
  readonly reviewStatus: "open" | "acknowledged";
}

export interface CatalogIntegrityProvenanceItem {
  readonly model: {
    readonly id: string;
    readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly status: string;
  };
  readonly attentionCategory: "provenance_incomplete";
  readonly reasons: readonly string[];
  readonly canonicalSource: {
    readonly id: string;
    readonly sourceType: string;
    readonly url: string | null;
    readonly title: string | null;
    readonly retrievedAt: string;
    readonly contentSha256: string | null;
  } | null;
  readonly currentBinding: {
    readonly id: string;
    readonly apiModelId: string;
    readonly endpointHostname: string;
    readonly source: {
      readonly id: string;
      readonly sourceType: string;
      readonly url: string | null;
      readonly title: string | null;
      readonly retrievedAt: string;
      readonly contentSha256: string | null;
    };
  } | null;
  readonly currentBindingCount: number;
  readonly promotionAudit: {
    readonly id: string;
    readonly candidateId: string;
    readonly promotedAt: string;
    readonly policyVersion: string;
    readonly sourceRecordId: string;
  } | null;
}

export interface CatalogIntegrityDashboard {
  readonly generatedAt: string;
  readonly summary: CatalogIntegritySummary;
  readonly observerSources: readonly CatalogIntegrityObserverSource[];
  readonly discovery: readonly CatalogIntegrityDiscoveryItem[];
  readonly drift: readonly CatalogIntegrityDriftItem[];
  readonly provenance: readonly CatalogIntegrityProvenanceItem[];
}

const FIRST_PARTY_SOURCE_TYPES = new Set(["provider_catalog", "provider_docs"]);

function categoryCounts(): Record<CatalogIntegrityCategory, number> {
  return {
    collection_failed: 0,
    collection_partial: 0,
    collection_stale: 0,
    discovery_unresolved: 0,
    promotion_ready: 0,
    promotion_blocked: 0,
    drift_open: 0,
    drift_acknowledged: 0,
    provenance_incomplete: 0,
  };
}

function sourceComplete(source: {
  source_type: string | null;
  source_url: string | null;
  source_title: string | null;
}): boolean {
  return Boolean(
    source.source_type &&
      FIRST_PARTY_SOURCE_TYPES.has(source.source_type) &&
      source.source_url &&
      source.source_title,
  );
}

export class PgCatalogIntegrity {
  private readonly discovery: PgCatalogDiscovery;
  private readonly driftReview: PgCatalogDriftReview;

  constructor(private readonly pool: Pool) {
    this.discovery = new PgCatalogDiscovery(pool);
    this.driftReview = new PgCatalogDriftReview(pool);
  }

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgCatalogIntegrity {
    return new PgCatalogIntegrity(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getDashboard(): Promise<CatalogIntegrityDashboard> {
    const [clock, observerResult, discovered, promotionReady, openDrift, acknowledgedDrift, provenanceResult] =
      await Promise.all([
        this.pool.query<{ generated_at: Date }>("SELECT now() AS generated_at"),
        this.pool.query<{
          id: string;
          provider_id: string;
          provider_slug: string;
          provider_name: string;
          source_key: string;
          source_kind: string;
          url: string;
          title: string;
          enabled: boolean;
          interval_seconds: number;
          last_attempted_at: Date | null;
          last_succeeded_at: Date | null;
          next_run_at: Date;
          is_stale: boolean;
          latest_run_id: string | null;
          latest_run_status: string | null;
          latest_run_started_at: Date | null;
          latest_run_completed_at: Date | null;
          latest_run_http_status: number | null;
          latest_run_item_count: number | null;
          latest_run_observations_emitted: number | null;
        }>(
          `SELECT
             source.id,
             provider.id AS provider_id,
             provider.slug AS provider_slug,
             provider.name AS provider_name,
             source.source_key,
             source.source_kind,
             source.url,
             source.title,
             source.enabled,
             source.interval_seconds,
             source.last_attempted_at,
             source.last_succeeded_at,
             source.next_run_at,
             (
               source.enabled
               AND now() > COALESCE(source.last_succeeded_at, source.created_at)
                 + make_interval(secs => source.interval_seconds * 2)
             ) AS is_stale,
             latest.id AS latest_run_id,
             latest.status AS latest_run_status,
             latest.started_at AS latest_run_started_at,
             latest.completed_at AS latest_run_completed_at,
             latest.http_status AS latest_run_http_status,
             latest.item_count AS latest_run_item_count,
             latest.observations_emitted AS latest_run_observations_emitted
           FROM modelapse.catalog_observer_sources source
           JOIN modelapse.providers provider ON provider.id = source.provider_id
           LEFT JOIN LATERAL (
             SELECT run.id, run.status, run.started_at, run.completed_at,
                    run.http_status, run.item_count, run.observations_emitted
               FROM modelapse.catalog_collection_runs run
              WHERE run.observer_source_id = source.id
              ORDER BY run.started_at DESC, run.id DESC
              LIMIT 1
           ) latest ON true
           ORDER BY provider.slug, source.source_key`,
        ),
        this.discovery.listCandidates({ status: "discovered", limit: 200 }),
        this.discovery.listCandidates({ status: "promotion_ready", limit: 200 }),
        this.driftReview.list({ status: "open", limit: 200 }),
        this.driftReview.list({ status: "acknowledged", limit: 200 }),
        this.pool.query<{
          model_id: string;
          provider_id: string;
          provider_slug: string;
          provider_name: string;
          canonical_slug: string;
          marketing_name: string;
          model_status: string;
          canonical_source_id: string | null;
          canonical_source_type: string | null;
          canonical_source_url: string | null;
          canonical_source_title: string | null;
          canonical_source_retrieved_at: Date | null;
          canonical_source_content_sha256: string | null;
          current_binding_count: string;
          binding_id: string | null;
          api_model_id: string | null;
          endpoint_hostname: string | null;
          binding_source_id: string | null;
          binding_source_type: string | null;
          binding_source_url: string | null;
          binding_source_title: string | null;
          binding_source_retrieved_at: Date | null;
          binding_source_content_sha256: string | null;
          promotion_id: string | null;
          promotion_candidate_id: string | null;
          promoted_at: Date | null;
          promotion_policy_version: string | null;
          promotion_source_record_id: string | null;
        }>(
          `SELECT
             model.id AS model_id,
             provider.id AS provider_id,
             provider.slug AS provider_slug,
             provider.name AS provider_name,
             model.canonical_slug,
             model.marketing_name,
             model.status::text AS model_status,
             canonical_source.id AS canonical_source_id,
             canonical_source.source_type AS canonical_source_type,
             canonical_source.url AS canonical_source_url,
             canonical_source.title AS canonical_source_title,
             canonical_source.retrieved_at AS canonical_source_retrieved_at,
             canonical_source.content_sha256 AS canonical_source_content_sha256,
             binding_count.count::text AS current_binding_count,
             current_binding.id AS binding_id,
             current_binding.api_model_id,
             current_binding.endpoint_hostname,
             current_binding.source_id AS binding_source_id,
             current_binding.source_type AS binding_source_type,
             current_binding.source_url AS binding_source_url,
             current_binding.source_title AS binding_source_title,
             current_binding.source_retrieved_at AS binding_source_retrieved_at,
             current_binding.source_content_sha256 AS binding_source_content_sha256,
             promotion.id AS promotion_id,
             promotion.candidate_id AS promotion_candidate_id,
             promotion.promoted_at,
             promotion.policy_version AS promotion_policy_version,
             promotion.source_record_id AS promotion_source_record_id
           FROM modelapse.models model
           JOIN modelapse.providers provider ON provider.id = model.provider_id
           LEFT JOIN modelapse.source_records canonical_source
             ON canonical_source.id = model.canonical_source_id
           LEFT JOIN LATERAL (
             SELECT count(*) AS count
               FROM modelapse.model_execution_bindings binding
               JOIN modelapse.provider_endpoints endpoint ON endpoint.id = binding.endpoint_id
              WHERE binding.model_id = model.id
                AND binding.valid_to IS NULL
                AND endpoint.path = 'first_party_direct'
           ) binding_count ON true
           LEFT JOIN LATERAL (
             SELECT
               binding.id,
               binding.api_model_id,
               endpoint.hostname AS endpoint_hostname,
               source.id AS source_id,
               source.source_type,
               source.url AS source_url,
               source.title AS source_title,
               source.retrieved_at AS source_retrieved_at,
               source.content_sha256 AS source_content_sha256
             FROM modelapse.model_execution_bindings binding
             JOIN modelapse.provider_endpoints endpoint
               ON endpoint.id = binding.endpoint_id
              AND endpoint.path = 'first_party_direct'
             JOIN modelapse.source_records source ON source.id = binding.source_id
            WHERE binding.model_id = model.id
              AND binding.valid_to IS NULL
            ORDER BY binding.valid_from DESC, binding.created_at DESC, binding.id DESC
            LIMIT 1
           ) current_binding ON true
           LEFT JOIN LATERAL (
             SELECT event.id, event.candidate_id, event.promoted_at,
                    event.policy_version, event.source_record_id
               FROM modelapse.catalog_promotion_events event
              WHERE event.model_id = model.id
              ORDER BY event.promoted_at DESC, event.id DESC
              LIMIT 1
           ) promotion ON true
           ORDER BY provider.slug, model.canonical_slug`,
        ),
      ]);

    const counts = categoryCounts();

    const observerSources: CatalogIntegrityObserverSource[] = observerResult.rows.map((row) => {
      let health: CatalogIntegrityObserverSource["health"];
      let attentionCategory: CatalogIntegrityObserverSource["attentionCategory"] = null;
      if (!row.enabled) {
        health = "disabled";
      } else if (row.latest_run_status === "failed") {
        health = "failed";
        attentionCategory = "collection_failed";
      } else if (row.latest_run_status === "partial") {
        health = "partial";
        attentionCategory = "collection_partial";
      } else if (row.is_stale) {
        health = "stale";
        attentionCategory = "collection_stale";
      } else if (!row.latest_run_id) {
        health = "never_collected";
      } else {
        health = "healthy";
      }
      if (attentionCategory) counts[attentionCategory] += 1;

      return {
        id: row.id,
        provider: { id: row.provider_id, slug: row.provider_slug, name: row.provider_name },
        sourceKey: row.source_key,
        sourceKind: row.source_kind,
        url: row.url,
        title: row.title,
        enabled: row.enabled,
        intervalSeconds: row.interval_seconds,
        lastAttemptedAt: row.last_attempted_at?.toISOString() ?? null,
        lastSucceededAt: row.last_succeeded_at?.toISOString() ?? null,
        nextRunAt: row.next_run_at.toISOString(),
        health,
        attentionCategory,
        latestRun:
          row.latest_run_id && row.latest_run_status && row.latest_run_started_at
            ? {
                id: row.latest_run_id,
                status: row.latest_run_status,
                startedAt: row.latest_run_started_at.toISOString(),
                completedAt: row.latest_run_completed_at?.toISOString() ?? null,
                httpStatus: row.latest_run_http_status,
                itemCount: row.latest_run_item_count,
                observationsEmitted: row.latest_run_observations_emitted ?? 0,
              }
            : null,
      };
    });

    const discovery: CatalogIntegrityDiscoveryItem[] = [
      ...discovered.map((candidate) => {
        counts.discovery_unresolved += 1;
        return {
          candidateId: candidate.id,
          provider: candidate.provider,
          remoteModelId: candidate.remoteModelId,
          status: candidate.status,
          firstSeenAt: candidate.firstSeenAt,
          lastSeenAt: candidate.lastSeenAt,
          observationCount: candidate.observationCount,
          latestProviderSnapshotId: candidate.latestProviderSnapshotId,
          attentionCategory: "discovery_unresolved" as const,
          promotionPolicy: {
            version: candidate.promotionPolicy.version,
            eligible: candidate.promotionPolicy.eligible,
            blockers: candidate.promotionPolicy.blockers,
          },
          latestFirstPartySource: candidate.lastSource,
        };
      }),
      ...promotionReady.map((candidate) => {
        const attentionCategory = candidate.promotionPolicy.eligible
          ? ("promotion_ready" as const)
          : ("promotion_blocked" as const);
        counts[attentionCategory] += 1;
        return {
          candidateId: candidate.id,
          provider: candidate.provider,
          remoteModelId: candidate.remoteModelId,
          status: candidate.status,
          firstSeenAt: candidate.firstSeenAt,
          lastSeenAt: candidate.lastSeenAt,
          observationCount: candidate.observationCount,
          latestProviderSnapshotId: candidate.latestProviderSnapshotId,
          attentionCategory,
          promotionPolicy: {
            version: candidate.promotionPolicy.version,
            eligible: candidate.promotionPolicy.eligible,
            blockers: candidate.promotionPolicy.blockers,
          },
          latestFirstPartySource: candidate.lastSource,
        };
      }),
    ];

    const drift: CatalogIntegrityDriftItem[] = [
      ...openDrift.map((item) => {
        counts.drift_open += 1;
        return {
          eventId: item.eventId,
          attentionCategory: "drift_open" as const,
          changeType: item.changeType,
          occurredAt: item.occurredAt,
          provider: item.provider,
          model: item.model,
          alias: item.alias,
          previousApiModelId: item.previousApiModelId,
          currentApiModelId: item.currentApiModelId,
          changedFields: item.changedFields,
          evidenceSource: item.currentSource,
          reviewStatus: "open" as const,
        };
      }),
      ...acknowledgedDrift.map((item) => {
        counts.drift_acknowledged += 1;
        return {
          eventId: item.eventId,
          attentionCategory: "drift_acknowledged" as const,
          changeType: item.changeType,
          occurredAt: item.occurredAt,
          provider: item.provider,
          model: item.model,
          alias: item.alias,
          previousApiModelId: item.previousApiModelId,
          currentApiModelId: item.currentApiModelId,
          changedFields: item.changedFields,
          evidenceSource: item.currentSource,
          reviewStatus: "acknowledged" as const,
        };
      }),
    ];

    const provenance: CatalogIntegrityProvenanceItem[] = [];
    for (const row of provenanceResult.rows) {
      const reasons: string[] = [];
      if (!row.canonical_source_id || !row.canonical_source_retrieved_at) {
        reasons.push("missing_canonical_source");
      } else if (!sourceComplete({
        source_type: row.canonical_source_type,
        source_url: row.canonical_source_url,
        source_title: row.canonical_source_title,
      })) {
        reasons.push("canonical_source_not_first_party_or_incomplete");
      }

      const bindingCount = Number(row.current_binding_count);
      if (bindingCount === 0) reasons.push("missing_current_first_party_binding");
      if (bindingCount > 1) reasons.push("multiple_current_first_party_bindings");
      if (
        row.binding_id &&
        !sourceComplete({
          source_type: row.binding_source_type,
          source_url: row.binding_source_url,
          source_title: row.binding_source_title,
        })
      ) {
        reasons.push("binding_source_not_first_party_or_incomplete");
      }

      if (
        row.promotion_id &&
        (row.promotion_policy_version !== "provider-catalog-v1" ||
          !row.promotion_source_record_id ||
          row.promotion_source_record_id !== row.canonical_source_id)
      ) {
        reasons.push("promotion_audit_mismatch");
      }

      if (reasons.length === 0) continue;
      counts.provenance_incomplete += 1;

      provenance.push({
        model: {
          id: row.model_id,
          provider: { id: row.provider_id, slug: row.provider_slug, name: row.provider_name },
          canonicalSlug: row.canonical_slug,
          marketingName: row.marketing_name,
          status: row.model_status,
        },
        attentionCategory: "provenance_incomplete",
        reasons,
        canonicalSource:
          row.canonical_source_id &&
          row.canonical_source_type &&
          row.canonical_source_retrieved_at
            ? {
                id: row.canonical_source_id,
                sourceType: row.canonical_source_type,
                url: row.canonical_source_url,
                title: row.canonical_source_title,
                retrievedAt: row.canonical_source_retrieved_at.toISOString(),
                contentSha256: row.canonical_source_content_sha256,
              }
            : null,
        currentBinding:
          row.binding_id &&
          row.api_model_id &&
          row.endpoint_hostname &&
          row.binding_source_id &&
          row.binding_source_type &&
          row.binding_source_retrieved_at
            ? {
                id: row.binding_id,
                apiModelId: row.api_model_id,
                endpointHostname: row.endpoint_hostname,
                source: {
                  id: row.binding_source_id,
                  sourceType: row.binding_source_type,
                  url: row.binding_source_url,
                  title: row.binding_source_title,
                  retrievedAt: row.binding_source_retrieved_at.toISOString(),
                  contentSha256: row.binding_source_content_sha256,
                },
              }
            : null,
        currentBindingCount: bindingCount,
        promotionAudit:
          row.promotion_id &&
          row.promotion_candidate_id &&
          row.promoted_at &&
          row.promotion_policy_version &&
          row.promotion_source_record_id
            ? {
                id: row.promotion_id,
                candidateId: row.promotion_candidate_id,
                promotedAt: row.promoted_at.toISOString(),
                policyVersion: row.promotion_policy_version,
                sourceRecordId: row.promotion_source_record_id,
              }
            : null,
      });
    }

    return {
      generatedAt: clock.rows[0]?.generated_at.toISOString() ?? new Date().toISOString(),
      summary: {
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        counts,
      },
      observerSources,
      discovery,
      drift,
      provenance,
    };
  }
}
