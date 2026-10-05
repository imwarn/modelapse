import { Pool } from "pg";
import { PgCatalogPresence, type CatalogPresenceEventKind } from "./catalog-presence.js";

export interface CatalogRemoteIdCaseSource {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export type CatalogRemoteIdCaseTimelineKind =
  | "discovery_observation"
  | "canonical_observation"
  | "presence_appeared"
  | "presence_not_observed"
  | "presence_reobserved"
  | "reconciliation"
  | "promotion"
  | "presence_review";

export interface CatalogRemoteIdCaseTimelineEvent {
  readonly id: string;
  readonly kind: CatalogRemoteIdCaseTimelineKind;
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
  readonly actor: string | null;
  readonly note: string | null;
  readonly source: CatalogRemoteIdCaseSource | null;
  readonly runId: string | null;
  readonly presenceEventId: string | null;
  readonly modelId: string | null;
}

export interface CatalogRemoteIdCase {
  readonly generatedAt: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly remoteModelId: string;
  readonly summary: {
    readonly observationEvents: number;
    readonly presenceTransitions: number;
    readonly reconciliationEvents: number;
    readonly reviewDecisions: number;
    readonly firstObservedAt: string | null;
    readonly lastObservedAt: string | null;
    readonly openPresenceReviews: number;
    readonly acknowledgedPresenceReviews: number;
    readonly resolvedPresenceReviews: number;
  };
  readonly current: {
    readonly candidate: {
      readonly id: string;
      readonly status: "discovered" | "matched" | "ignored" | "promotion_ready";
      readonly firstSeenAt: string;
      readonly lastSeenAt: string;
      readonly observationCount: number;
      readonly resolvedAt: string | null;
      readonly resolvedModel: {
        readonly id: string;
        readonly canonicalSlug: string;
        readonly marketingName: string;
      } | null;
    } | null;
    readonly canonicalModel: {
      readonly id: string;
      readonly canonicalSlug: string;
      readonly marketingName: string;
      readonly status: string;
    } | null;
    readonly promotion: {
      readonly id: string;
      readonly modelId: string;
      readonly promotedAt: string;
      readonly actor: string;
      readonly policyVersion: string;
      readonly source: CatalogRemoteIdCaseSource;
    } | null;
  };
  readonly presenceReviews: readonly {
    readonly eventId: string;
    readonly occurredAt: string;
    readonly status: "open" | "acknowledged" | "resolved";
    readonly acknowledgedAt: string | null;
    readonly resolvedAt: string | null;
    readonly runId: string;
    readonly previousCompleteRunId: string | null;
    readonly observerSourceId: string;
    readonly decisions: readonly {
      readonly id: string;
      readonly action: "acknowledge" | "resolve" | "reopen";
      readonly actor: string;
      readonly note: string | null;
      readonly decidedAt: string;
    }[];
  }[];
  readonly timeline: readonly CatalogRemoteIdCaseTimelineEvent[];
}

type SourceColumns = {
  source_id: string | null;
  source_type: string | null;
  source_url: string | null;
  source_title: string | null;
  source_retrieved_at: Date | null;
  source_content_sha256: string | null;
};

function sourceView(row: SourceColumns): CatalogRemoteIdCaseSource | null {
  if (!row.source_id || !row.source_type || !row.source_retrieved_at) return null;
  return {
    id: row.source_id,
    sourceType: row.source_type,
    url: row.source_url,
    title: row.source_title,
    retrievedAt: row.source_retrieved_at.toISOString(),
    contentSha256: row.source_content_sha256,
  };
}

function presenceKind(kind: CatalogPresenceEventKind): CatalogRemoteIdCaseTimelineKind {
  if (kind === "appeared_in_complete_snapshot") return "presence_appeared";
  if (kind === "reobserved_in_complete_snapshot") return "presence_reobserved";
  return "presence_not_observed";
}

function presenceTitle(kind: CatalogPresenceEventKind): string {
  if (kind === "appeared_in_complete_snapshot") return "Appeared in complete model-list snapshot";
  if (kind === "reobserved_in_complete_snapshot") return "Reobserved in complete model-list snapshot";
  return "Not observed in next complete model-list snapshot";
}

export class PgCatalogRemoteIdCase {
  private readonly presence: PgCatalogPresence;

  constructor(private readonly pool: Pool) {
    this.presence = new PgCatalogPresence(pool);
  }

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgCatalogRemoteIdCase {
    return new PgCatalogRemoteIdCase(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async get(
    providerId: string,
    remoteModelId: string,
  ): Promise<CatalogRemoteIdCase | null> {
    const normalizedRemoteModelId = remoteModelId.trim();
    if (!normalizedRemoteModelId) {
      throw new Error("remoteModelId must be non-empty");
    }

    const [clock, providerResult, candidateResult, aliasResult] = await Promise.all([
      this.pool.query<{ generated_at: Date }>("SELECT now() AS generated_at"),
      this.pool.query<{ id: string; slug: string; name: string }>(
        `SELECT id, slug, name FROM modelapse.providers WHERE id = $1`,
        [providerId],
      ),
      this.pool.query<{
        id: string;
        status: "discovered" | "matched" | "ignored" | "promotion_ready";
        first_seen_at: Date;
        last_seen_at: Date;
        observation_count: string;
        resolved_at: Date | null;
        resolved_model_id: string | null;
        resolved_canonical_slug: string | null;
        resolved_marketing_name: string | null;
      }>(
        `SELECT
           candidate.id,
           candidate.status,
           candidate.first_seen_at,
           candidate.last_seen_at,
           candidate.observation_count::text,
           candidate.resolved_at,
           model.id AS resolved_model_id,
           model.canonical_slug AS resolved_canonical_slug,
           model.marketing_name AS resolved_marketing_name
         FROM modelapse.catalog_discovery_candidates candidate
         LEFT JOIN modelapse.models model ON model.id = candidate.resolved_model_id
        WHERE candidate.provider_id = $1
          AND candidate.remote_model_id = $2`,
        [providerId, normalizedRemoteModelId],
      ),
      this.pool.query<{ id: string }>(
        `SELECT id
           FROM modelapse.model_aliases
          WHERE provider_id = $1
            AND alias = $2`,
        [providerId, normalizedRemoteModelId],
      ),
    ]);

    const provider = providerResult.rows[0];
    if (!provider) return null;

    const candidate = candidateResult.rows[0] ?? null;
    const aliasId = aliasResult.rows[0]?.id ?? null;

    const [
      discoveryObservations,
      canonicalObservations,
      reconciliations,
      promotionResult,
      reviewRows,
      reviewDecisionRows,
      presenceHistory,
    ] = await Promise.all([
      candidate
        ? this.pool.query<
            {
              id: string;
              collection_run_id: string;
              observed_at: Date;
              provider_snapshot_id: string | null;
            } & SourceColumns
          >(
            `SELECT
               observation.id,
               observation.collection_run_id,
               observation.observed_at,
               observation.provider_snapshot_id,
               source.id AS source_id,
               source.source_type,
               source.url AS source_url,
               source.title AS source_title,
               source.retrieved_at AS source_retrieved_at,
               source.content_sha256 AS source_content_sha256
             FROM modelapse.catalog_discovery_observations observation
             JOIN modelapse.source_records source
               ON source.id = observation.source_record_id
            WHERE observation.candidate_id = $1
            ORDER BY observation.observed_at, observation.id`,
            [candidate.id],
          )
        : Promise.resolve({ rows: [] as Array<{
            id: string;
            collection_run_id: string;
            observed_at: Date;
            provider_snapshot_id: string | null;
          } & SourceColumns> }),
      aliasId
        ? this.pool.query<
            {
              id: string;
              observed_at: Date;
              resolved_model_id: string | null;
              canonical_slug: string | null;
              marketing_name: string | null;
            } & SourceColumns
          >(
            `SELECT
               event.id,
               event.observed_at,
               COALESCE(event.resolved_model_id, snapshot.model_id) AS resolved_model_id,
               model.canonical_slug,
               model.marketing_name,
               source.id AS source_id,
               source.source_type,
               source.url AS source_url,
               source.title AS source_title,
               source.retrieved_at AS source_retrieved_at,
               source.content_sha256 AS source_content_sha256
             FROM modelapse.alias_resolution_events event
             LEFT JOIN modelapse.model_snapshots snapshot
               ON snapshot.id = event.resolved_snapshot_id
             LEFT JOIN modelapse.models model
               ON model.id = COALESCE(event.resolved_model_id, snapshot.model_id)
             LEFT JOIN modelapse.source_records source
               ON source.id = event.source_id
            WHERE event.alias_id = $1
            ORDER BY event.observed_at, event.id`,
            [aliasId],
          )
        : Promise.resolve({ rows: [] as Array<{
            id: string;
            observed_at: Date;
            resolved_model_id: string | null;
            canonical_slug: string | null;
            marketing_name: string | null;
          } & SourceColumns> }),
      candidate
        ? this.pool.query<{
            id: string;
            action: string;
            decided_at: Date;
            actor: string;
            note: string | null;
            resolved_model_id: string | null;
          }>(
            `SELECT id, action, decided_at, actor, note, resolved_model_id
               FROM modelapse.catalog_reconciliation_events
              WHERE candidate_id = $1
              ORDER BY decided_at, id`,
            [candidate.id],
          )
        : Promise.resolve({ rows: [] as {
            id: string;
            action: string;
            decided_at: Date;
            actor: string;
            note: string | null;
            resolved_model_id: string | null;
          }[] }),
      candidate
        ? this.pool.query<
            {
              id: string;
              model_id: string;
              promoted_at: Date;
              actor: string;
              policy_version: string;
            } & SourceColumns
          >(
            `SELECT
               promotion.id,
               promotion.model_id,
               promotion.promoted_at,
               promotion.actor,
               promotion.policy_version,
               source.id AS source_id,
               source.source_type,
               source.url AS source_url,
               source.title AS source_title,
               source.retrieved_at AS source_retrieved_at,
               source.content_sha256 AS source_content_sha256
             FROM modelapse.catalog_promotion_events promotion
             JOIN modelapse.source_records source
               ON source.id = promotion.source_record_id
            WHERE promotion.candidate_id = $1`,
            [candidate.id],
          )
        : Promise.resolve({ rows: [] as Array<{
            id: string;
            model_id: string;
            promoted_at: Date;
            actor: string;
            policy_version: string;
          } & SourceColumns> }),
      this.pool.query<{
        presence_event_id: string;
        observer_source_id: string;
        run_id: string;
        previous_complete_run_id: string | null;
        occurred_at: Date;
        status: "open" | "acknowledged" | "resolved";
        acknowledged_at: Date | null;
        resolved_at: Date | null;
      }>(
        `SELECT
           presence_event_id,
           observer_source_id,
           run_id,
           previous_complete_run_id,
           occurred_at,
           status,
           acknowledged_at,
           resolved_at
         FROM modelapse.catalog_presence_reviews
        WHERE provider_id = $1
          AND remote_model_id = $2
        ORDER BY occurred_at, presence_event_id`,
        [providerId, normalizedRemoteModelId],
      ),
      this.pool.query<{
        id: string;
        presence_event_id: string;
        action: "acknowledge" | "resolve" | "reopen";
        actor: string;
        note: string | null;
        decided_at: Date;
      }>(
        `SELECT event.id, event.presence_event_id, event.action, event.actor,
                event.note, event.decided_at
           FROM modelapse.catalog_presence_review_events event
           JOIN modelapse.catalog_presence_reviews review
             ON review.presence_event_id = event.presence_event_id
          WHERE review.provider_id = $1
            AND review.remote_model_id = $2
          ORDER BY event.decided_at, event.id`,
        [providerId, normalizedRemoteModelId],
      ),
      this.presence.getProvider(providerId, { runLimit: 100 }),
    ]);

    const presenceEvents =
      presenceHistory?.events.filter(
        (event) => event.remoteModelId === normalizedRemoteModelId,
      ) ?? [];

    if (
      !candidate &&
      !aliasId &&
      presenceEvents.length === 0 &&
      reviewRows.rows.length === 0
    ) {
      return null;
    }

    const timeline: CatalogRemoteIdCaseTimelineEvent[] = [];
    const observationTimes: string[] = [];

    for (const row of discoveryObservations.rows) {
      const source = sourceView(row);
      const occurredAt = row.observed_at.toISOString();
      observationTimes.push(occurredAt);
      timeline.push({
        id: "discovery-observation:" + row.id,
        kind: "discovery_observation",
        occurredAt,
        title: "Observed as discovery Candidate",
        description: row.provider_snapshot_id
          ? "Provider snapshot " + row.provider_snapshot_id
          : "First-party catalog observation",
        actor: null,
        note: null,
        source,
        runId: row.collection_run_id,
        presenceEventId: null,
        modelId: null,
      });
    }

    for (const row of canonicalObservations.rows) {
      const source = sourceView(row);
      const occurredAt = row.observed_at.toISOString();
      observationTimes.push(occurredAt);
      timeline.push({
        id: "canonical-observation:" + row.id,
        kind: "canonical_observation",
        occurredAt,
        title: "Observed as canonical alias",
        description:
          row.marketing_name && row.canonical_slug
            ? row.marketing_name + " · " + row.canonical_slug
            : "Source-backed alias resolution observation",
        actor: null,
        note: null,
        source,
        runId: null,
        presenceEventId: null,
        modelId: row.resolved_model_id,
      });
    }

    for (const event of presenceEvents) {
      timeline.push({
        id: "presence:" + event.id,
        kind: presenceKind(event.kind),
        occurredAt: event.occurredAt,
        title: presenceTitle(event.kind),
        description: event.interpretation.replaceAll("_", " "),
        actor: null,
        note: null,
        source: null,
        runId: event.runId,
        presenceEventId: event.id,
        modelId: event.currentContext.canonicalModel?.id ?? null,
      });
    }

    for (const row of reconciliations.rows) {
      timeline.push({
        id: "reconciliation:" + row.id,
        kind: "reconciliation",
        occurredAt: row.decided_at.toISOString(),
        title: "Candidate decision: " + row.action.replaceAll("_", " "),
        description: row.resolved_model_id
          ? "Resolved canonical Model " + row.resolved_model_id
          : "Explicit Candidate workflow decision",
        actor: row.actor,
        note: row.note,
        source: null,
        runId: null,
        presenceEventId: null,
        modelId: row.resolved_model_id,
      });
    }

    const promotionRow = promotionResult.rows[0] ?? null;
    const promotionSource = promotionRow ? sourceView(promotionRow) : null;
    if (promotionRow) {
      timeline.push({
        id: "promotion:" + promotionRow.id,
        kind: "promotion",
        occurredAt: promotionRow.promoted_at.toISOString(),
        title: "Promoted to canonical Model",
        description: "Policy " + promotionRow.policy_version,
        actor: promotionRow.actor,
        note: null,
        source: promotionSource,
        runId: null,
        presenceEventId: null,
        modelId: promotionRow.model_id,
      });
    }

    const derivedPresenceEventIds = new Set(
      presenceEvents.map((event) => event.id),
    );
    for (const row of reviewRows.rows) {
      if (derivedPresenceEventIds.has(row.presence_event_id)) continue;
      timeline.push({
        id: "presence-anchor:" + row.presence_event_id,
        kind: "presence_not_observed",
        occurredAt: row.occurred_at.toISOString(),
        title: "Not observed in complete model-list evidence",
        description:
          "Durable presence-review anchor retained after the derived comparison event aged outside the loaded presence window",
        actor: null,
        note: null,
        source: null,
        runId: row.run_id,
        presenceEventId: row.presence_event_id,
        modelId: null,
      });
    }

    const decisionsByReview = new Map<
      string,
      typeof reviewDecisionRows.rows
    >();
    for (const row of reviewDecisionRows.rows) {
      const rows = decisionsByReview.get(row.presence_event_id) ?? [];
      rows.push(row);
      decisionsByReview.set(row.presence_event_id, rows);
      timeline.push({
        id: "presence-review:" + row.id,
        kind: "presence_review",
        occurredAt: row.decided_at.toISOString(),
        title: "Presence review: " + row.action,
        description:
          "Operator handling of not-observed evidence; no lifecycle inference",
        actor: row.actor,
        note: row.note,
        source: null,
        runId: null,
        presenceEventId: row.presence_event_id,
        modelId: null,
      });
    }

    const presenceReviews = reviewRows.rows.map((row) => ({
      eventId: row.presence_event_id,
      occurredAt: row.occurred_at.toISOString(),
      status: row.status,
      acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
      resolvedAt: row.resolved_at?.toISOString() ?? null,
      runId: row.run_id,
      previousCompleteRunId: row.previous_complete_run_id,
      observerSourceId: row.observer_source_id,
      decisions: (decisionsByReview.get(row.presence_event_id) ?? []).map(
        (decision) => ({
          id: decision.id,
          action: decision.action,
          actor: decision.actor,
          note: decision.note,
          decidedAt: decision.decided_at.toISOString(),
        }),
      ),
    }));

    const latestCanonicalObservation =
      canonicalObservations.rows.at(-1) ?? null;
    const canonicalModelId =
      latestCanonicalObservation?.resolved_model_id ??
      candidate?.resolved_model_id ??
      promotionRow?.model_id ??
      null;

    const canonicalModelResult = canonicalModelId
      ? await this.pool.query<{
          id: string;
          canonical_slug: string;
          marketing_name: string;
          status: string;
        }>(
          `SELECT id, canonical_slug, marketing_name, status
             FROM modelapse.models
            WHERE id = $1`,
          [canonicalModelId],
        )
      : { rows: [] as {
          id: string;
          canonical_slug: string;
          marketing_name: string;
          status: string;
        }[] };

    const canonicalModel = canonicalModelResult.rows[0] ?? null;

    timeline.sort((a, b) => {
      const byTime = a.occurredAt.localeCompare(b.occurredAt);
      return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
    });
    observationTimes.sort();

    return {
      generatedAt:
        clock.rows[0]?.generated_at.toISOString() ?? new Date().toISOString(),
      provider,
      remoteModelId: normalizedRemoteModelId,
      summary: {
        observationEvents:
          discoveryObservations.rows.length + canonicalObservations.rows.length,
        presenceTransitions: presenceEvents.length,
        reconciliationEvents: reconciliations.rows.length,
        reviewDecisions: reviewDecisionRows.rows.length,
        firstObservedAt: observationTimes.at(0) ?? null,
        lastObservedAt: observationTimes.at(-1) ?? null,
        openPresenceReviews: presenceReviews.filter(
          (review) => review.status === "open",
        ).length,
        acknowledgedPresenceReviews: presenceReviews.filter(
          (review) => review.status === "acknowledged",
        ).length,
        resolvedPresenceReviews: presenceReviews.filter(
          (review) => review.status === "resolved",
        ).length,
      },
      current: {
        candidate: candidate
          ? {
              id: candidate.id,
              status: candidate.status,
              firstSeenAt: candidate.first_seen_at.toISOString(),
              lastSeenAt: candidate.last_seen_at.toISOString(),
              observationCount: Number(candidate.observation_count),
              resolvedAt: candidate.resolved_at?.toISOString() ?? null,
              resolvedModel:
                candidate.resolved_model_id &&
                candidate.resolved_canonical_slug &&
                candidate.resolved_marketing_name
                  ? {
                      id: candidate.resolved_model_id,
                      canonicalSlug: candidate.resolved_canonical_slug,
                      marketingName: candidate.resolved_marketing_name,
                    }
                  : null,
            }
          : null,
        canonicalModel: canonicalModel
          ? {
              id: canonicalModel.id,
              canonicalSlug: canonicalModel.canonical_slug,
              marketingName: canonicalModel.marketing_name,
              status: canonicalModel.status,
            }
          : null,
        promotion:
          promotionRow && promotionSource
            ? {
                id: promotionRow.id,
                modelId: promotionRow.model_id,
                promotedAt: promotionRow.promoted_at.toISOString(),
                actor: promotionRow.actor,
                policyVersion: promotionRow.policy_version,
                source: promotionSource,
              }
            : null,
      },
      presenceReviews,
      timeline,
    };
  }
}
