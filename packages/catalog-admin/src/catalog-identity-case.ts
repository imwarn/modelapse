import { Pool } from "pg";

export interface CatalogIdentityCaseSource {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export interface CatalogIdentityCaseTimelineEvent {
  readonly id: string;
  readonly kind:
    | "discovery_observation"
    | "reconciliation"
    | "promotion"
    | "identity_drift"
    | "drift_review";
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
  readonly candidateId: string | null;
  readonly driftEventId: string | null;
  readonly actor: string | null;
  readonly note: string | null;
  readonly source: CatalogIdentityCaseSource | null;
}

export interface CatalogIdentityCase {
  readonly model: {
    readonly id: string;
    readonly provider: {
      readonly id: string;
      readonly slug: string;
      readonly name: string;
    };
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly status: string;
  };
  readonly candidates: readonly {
    readonly id: string;
    readonly remoteModelId: string;
    readonly status: string;
    readonly firstSeenAt: string;
    readonly lastSeenAt: string;
    readonly observationCount: number;
    readonly resolvedAt: string | null;
    readonly observations: readonly {
      readonly id: string;
      readonly observedAt: string;
      readonly providerSnapshotId: string | null;
      readonly source: CatalogIdentityCaseSource;
    }[];
    readonly decisions: readonly {
      readonly id: string;
      readonly action: string;
      readonly decidedAt: string;
      readonly actor: string;
      readonly note: string | null;
      readonly resolvedModelId: string | null;
    }[];
    readonly promotion: {
      readonly id: string;
      readonly promotedAt: string;
      readonly actor: string;
      readonly canonicalSlug: string;
      readonly marketingName: string;
      readonly modelStatus: string;
      readonly policyVersion: string;
      readonly evidenceJson: string;
      readonly source: CatalogIdentityCaseSource;
    } | null;
  }[];
  readonly drift: readonly {
    readonly eventId: string;
    readonly changeType: string;
    readonly occurredAt: string;
    readonly changedFields: readonly string[];
    readonly previousApiModelId: string | null;
    readonly currentApiModelId: string | null;
    readonly previousSource: CatalogIdentityCaseSource | null;
    readonly currentSource: CatalogIdentityCaseSource;
    readonly review: {
      readonly status: "open" | "acknowledged" | "resolved";
      readonly acknowledgedAt: string | null;
      readonly resolvedAt: string | null;
      readonly decisions: readonly {
        readonly id: string;
        readonly action: "acknowledge" | "resolve" | "reopen";
        readonly actor: string;
        readonly note: string | null;
        readonly decidedAt: string;
      }[];
    };
  }[];
  readonly timeline: readonly CatalogIdentityCaseTimelineEvent[];
}

type SourceColumns = {
  source_id: string | null;
  source_type: string | null;
  source_url: string | null;
  source_title: string | null;
  source_retrieved_at: Date | null;
  source_content_sha256: string | null;
};

function sourceView(row: SourceColumns): CatalogIdentityCaseSource | null {
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

function requiredSource(row: SourceColumns, context: string): CatalogIdentityCaseSource {
  const source = sourceView(row);
  if (!source) throw new Error(context + " is missing source provenance");
  return source;
}

export class PgCatalogIdentityCase {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgCatalogIdentityCase {
    return new PgCatalogIdentityCase(
      new Pool({ connectionString, max: options.max ?? 2 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async get(modelId: string): Promise<CatalogIdentityCase | null> {
    const normalizedModelId = modelId.trim();
    if (!normalizedModelId) throw new Error("modelId must be non-empty");

    const modelResult = await this.pool.query<{
      id: string;
      provider_id: string;
      provider_slug: string;
      provider_name: string;
      canonical_slug: string;
      marketing_name: string;
      status: string;
    }>(
      `SELECT
         model.id,
         provider.id AS provider_id,
         provider.slug AS provider_slug,
         provider.name AS provider_name,
         model.canonical_slug,
         model.marketing_name,
         model.status
       FROM modelapse.models model
       JOIN modelapse.providers provider ON provider.id = model.provider_id
       WHERE model.id = $1`,
      [normalizedModelId],
    );
    const model = modelResult.rows[0];
    if (!model) return null;

    const candidateRows = await this.pool.query<{
      id: string;
      remote_model_id: string;
      status: string;
      first_seen_at: Date;
      last_seen_at: Date;
      observation_count: string;
      resolved_at: Date | null;
    }>(
      `SELECT DISTINCT
         candidate.id,
         candidate.remote_model_id,
         candidate.status,
         candidate.first_seen_at,
         candidate.last_seen_at,
         candidate.observation_count::text,
         candidate.resolved_at
       FROM modelapse.catalog_discovery_candidates candidate
       WHERE candidate.resolved_model_id = $1
          OR EXISTS (
            SELECT 1
              FROM modelapse.catalog_promotion_events promotion
             WHERE promotion.candidate_id = candidate.id
               AND promotion.model_id = $1
          )
          OR EXISTS (
            SELECT 1
              FROM modelapse.catalog_reconciliation_events decision
             WHERE decision.candidate_id = candidate.id
               AND decision.resolved_model_id = $1
          )
       ORDER BY candidate.first_seen_at, candidate.id`,
      [normalizedModelId],
    );
    const candidateIds = candidateRows.rows.map((row) => row.id);

    const observationRows =
      candidateIds.length === 0
        ? { rows: [] as Array<{
            id: string;
            candidate_id: string;
            observed_at: Date;
            provider_snapshot_id: string | null;
          } & SourceColumns> }
        : await this.pool.query<
            {
              id: string;
              candidate_id: string;
              observed_at: Date;
              provider_snapshot_id: string | null;
            } & SourceColumns
          >(
            `SELECT
               observation.id,
               observation.candidate_id,
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
             WHERE observation.candidate_id = ANY($1::uuid[])
             ORDER BY observation.observed_at, observation.id`,
            [candidateIds],
          );

    const decisionRows =
      candidateIds.length === 0
        ? { rows: [] as Array<{
            id: string;
            candidate_id: string;
            action: string;
            decided_at: Date;
            actor: string;
            note: string | null;
            resolved_model_id: string | null;
          }> }
        : await this.pool.query<{
            id: string;
            candidate_id: string;
            action: string;
            decided_at: Date;
            actor: string;
            note: string | null;
            resolved_model_id: string | null;
          }>(
            `SELECT
               id,
               candidate_id,
               action,
               decided_at,
               actor,
               note,
               resolved_model_id
             FROM modelapse.catalog_reconciliation_events
             WHERE candidate_id = ANY($1::uuid[])
             ORDER BY decided_at, id`,
            [candidateIds],
          );

    const promotionRows =
      candidateIds.length === 0
        ? { rows: [] as Array<{
            id: string;
            candidate_id: string;
            promoted_at: Date;
            actor: string;
            canonical_slug: string;
            marketing_name: string;
            model_status: string;
            policy_version: string;
            evidence: Record<string, unknown>;
            metadata: Record<string, unknown>;
          } & SourceColumns> }
        : await this.pool.query<
            {
              id: string;
              candidate_id: string;
              promoted_at: Date;
              actor: string;
              canonical_slug: string;
              marketing_name: string;
              model_status: string;
              policy_version: string;
              evidence: Record<string, unknown>;
              metadata: Record<string, unknown>;
            } & SourceColumns
          >(
            `SELECT
               promotion.id,
               promotion.candidate_id,
               promotion.promoted_at,
               promotion.actor,
               promotion.canonical_slug,
               promotion.marketing_name,
               promotion.model_status,
               promotion.policy_version,
               promotion.evidence,
               promotion.metadata,
               source.id AS source_id,
               source.source_type,
               source.url AS source_url,
               source.title AS source_title,
               source.retrieved_at AS source_retrieved_at,
               source.content_sha256 AS source_content_sha256
             FROM modelapse.catalog_promotion_events promotion
             JOIN modelapse.source_records source
               ON source.id = promotion.source_record_id
             WHERE promotion.candidate_id = ANY($1::uuid[])
             ORDER BY promotion.promoted_at, promotion.id`,
            [candidateIds],
          );

    const driftRows = await this.pool.query<
      {
        event_id: string;
        change_type: string;
        occurred_at: Date;
        changed_fields: string[];
        previous_api_model_id: string | null;
        current_api_model_id: string | null;
        review_status: "open" | "acknowledged" | "resolved" | null;
        acknowledged_at: Date | null;
        resolved_at: Date | null;
        previous_source_id: string | null;
        previous_source_type: string | null;
        previous_source_url: string | null;
        previous_source_title: string | null;
        previous_source_retrieved_at: Date | null;
        previous_source_content_sha256: string | null;
        current_source_id: string;
        current_source_type: string;
        current_source_url: string | null;
        current_source_title: string | null;
        current_source_retrieved_at: Date;
        current_source_content_sha256: string | null;
      }
    >(
      `SELECT
         drift.event_id,
         drift.change_type,
         drift.occurred_at,
         drift.changed_fields,
         drift.previous_api_model_id,
         drift.current_api_model_id,
         review.status AS review_status,
         review.acknowledged_at,
         review.resolved_at,
         previous_source.id AS previous_source_id,
         previous_source.source_type AS previous_source_type,
         previous_source.url AS previous_source_url,
         previous_source.title AS previous_source_title,
         previous_source.retrieved_at AS previous_source_retrieved_at,
         previous_source.content_sha256 AS previous_source_content_sha256,
         current_source.id AS current_source_id,
         current_source.source_type AS current_source_type,
         current_source.url AS current_source_url,
         current_source.title AS current_source_title,
         current_source.retrieved_at AS current_source_retrieved_at,
         current_source.content_sha256 AS current_source_content_sha256
       FROM modelapse.catalog_identity_drift_events drift
       LEFT JOIN modelapse.catalog_identity_drift_reviews review
         ON review.drift_event_id = drift.event_id
       LEFT JOIN modelapse.source_records previous_source
         ON previous_source.id = drift.previous_source_id
       JOIN modelapse.source_records current_source
         ON current_source.id = drift.current_source_id
       WHERE drift.previous_model_id = $1
          OR drift.current_model_id = $1
       ORDER BY drift.occurred_at, drift.event_id`,
      [normalizedModelId],
    );
    const driftIds = driftRows.rows.map((row) => row.event_id);

    const reviewDecisionRows =
      driftIds.length === 0
        ? { rows: [] as Array<{
            id: string;
            drift_event_id: string;
            action: "acknowledge" | "resolve" | "reopen";
            actor: string;
            note: string | null;
            decided_at: Date;
          }> }
        : await this.pool.query<{
            id: string;
            drift_event_id: string;
            action: "acknowledge" | "resolve" | "reopen";
            actor: string;
            note: string | null;
            decided_at: Date;
          }>(
            `SELECT id, drift_event_id, action, actor, note, decided_at
               FROM modelapse.catalog_identity_drift_review_events
              WHERE drift_event_id = ANY($1::text[])
              ORDER BY decided_at, id`,
            [driftIds],
          );

    const observationsByCandidate = new Map<string, typeof observationRows.rows>();
    for (const row of observationRows.rows) {
      const rows = observationsByCandidate.get(row.candidate_id) ?? [];
      rows.push(row);
      observationsByCandidate.set(row.candidate_id, rows);
    }
    const decisionsByCandidate = new Map<string, typeof decisionRows.rows>();
    for (const row of decisionRows.rows) {
      const rows = decisionsByCandidate.get(row.candidate_id) ?? [];
      rows.push(row);
      decisionsByCandidate.set(row.candidate_id, rows);
    }
    const promotionByCandidate = new Map(
      promotionRows.rows.map((row) => [row.candidate_id, row] as const),
    );
    const reviewDecisionsByDrift = new Map<string, typeof reviewDecisionRows.rows>();
    for (const row of reviewDecisionRows.rows) {
      const rows = reviewDecisionsByDrift.get(row.drift_event_id) ?? [];
      rows.push(row);
      reviewDecisionsByDrift.set(row.drift_event_id, rows);
    }

    const timeline: CatalogIdentityCaseTimelineEvent[] = [];

    const candidates = candidateRows.rows.map((candidate) => {
      const observations = (observationsByCandidate.get(candidate.id) ?? []).map((row) => {
        const source = requiredSource(row, "Catalog discovery observation");
        timeline.push({
          id: "observation:" + row.id,
          kind: "discovery_observation",
          occurredAt: row.observed_at.toISOString(),
          title: "Observed remote model " + candidate.remote_model_id,
          description: row.provider_snapshot_id
            ? "Provider snapshot " + row.provider_snapshot_id
            : "First-party catalog observation",
          candidateId: candidate.id,
          driftEventId: null,
          actor: null,
          note: null,
          source,
        });
        return {
          id: row.id,
          observedAt: row.observed_at.toISOString(),
          providerSnapshotId: row.provider_snapshot_id,
          source,
        };
      });

      const decisions = (decisionsByCandidate.get(candidate.id) ?? []).map((row) => {
        timeline.push({
          id: "reconciliation:" + row.id,
          kind: "reconciliation",
          occurredAt: row.decided_at.toISOString(),
          title: "Candidate decision: " + row.action.replaceAll("_", " "),
          description: row.resolved_model_id
            ? "Resolved model " + row.resolved_model_id
            : "Candidate state decision",
          candidateId: candidate.id,
          driftEventId: null,
          actor: row.actor,
          note: row.note,
          source: null,
        });
        return {
          id: row.id,
          action: row.action,
          decidedAt: row.decided_at.toISOString(),
          actor: row.actor,
          note: row.note,
          resolvedModelId: row.resolved_model_id,
        };
      });

      const promotionRow = promotionByCandidate.get(candidate.id);
      const promotion = promotionRow
        ? (() => {
            const source = requiredSource(promotionRow, "Catalog promotion");
            timeline.push({
              id: "promotion:" + promotionRow.id,
              kind: "promotion",
              occurredAt: promotionRow.promoted_at.toISOString(),
              title: "Promoted to canonical Model",
              description:
                promotionRow.marketing_name +
                " · " +
                promotionRow.canonical_slug +
                " · policy " +
                promotionRow.policy_version,
              candidateId: candidate.id,
              driftEventId: null,
              actor: promotionRow.actor,
              note:
                typeof promotionRow.metadata.note === "string"
                  ? promotionRow.metadata.note
                  : null,
              source,
            });
            return {
              id: promotionRow.id,
              promotedAt: promotionRow.promoted_at.toISOString(),
              actor: promotionRow.actor,
              canonicalSlug: promotionRow.canonical_slug,
              marketingName: promotionRow.marketing_name,
              modelStatus: promotionRow.model_status,
              policyVersion: promotionRow.policy_version,
              evidenceJson: JSON.stringify(promotionRow.evidence),
              source,
            };
          })()
        : null;

      return {
        id: candidate.id,
        remoteModelId: candidate.remote_model_id,
        status: candidate.status,
        firstSeenAt: candidate.first_seen_at.toISOString(),
        lastSeenAt: candidate.last_seen_at.toISOString(),
        observationCount: Number(candidate.observation_count),
        resolvedAt: candidate.resolved_at?.toISOString() ?? null,
        observations,
        decisions,
        promotion,
      };
    });

    const drift = driftRows.rows.map((row) => {
      const previousSource = sourceView({
        source_id: row.previous_source_id,
        source_type: row.previous_source_type,
        source_url: row.previous_source_url,
        source_title: row.previous_source_title,
        source_retrieved_at: row.previous_source_retrieved_at,
        source_content_sha256: row.previous_source_content_sha256,
      });
      const currentSource = requiredSource(
        {
          source_id: row.current_source_id,
          source_type: row.current_source_type,
          source_url: row.current_source_url,
          source_title: row.current_source_title,
          source_retrieved_at: row.current_source_retrieved_at,
          source_content_sha256: row.current_source_content_sha256,
        },
        "Catalog identity drift",
      );
      timeline.push({
        id: "drift:" + row.event_id,
        kind: "identity_drift",
        occurredAt: row.occurred_at.toISOString(),
        title: "Identity drift: " + row.change_type.replaceAll("_", " "),
        description: row.changed_fields.join(", "),
        candidateId: null,
        driftEventId: row.event_id,
        actor: null,
        note: null,
        source: currentSource,
      });

      const decisions = (reviewDecisionsByDrift.get(row.event_id) ?? []).map((decision) => {
        timeline.push({
          id: "drift-review:" + decision.id,
          kind: "drift_review",
          occurredAt: decision.decided_at.toISOString(),
          title: "Drift review: " + decision.action,
          description: "Review decision for " + row.change_type.replaceAll("_", " "),
          candidateId: null,
          driftEventId: row.event_id,
          actor: decision.actor,
          note: decision.note,
          source: currentSource,
        });
        return {
          id: decision.id,
          action: decision.action,
          actor: decision.actor,
          note: decision.note,
          decidedAt: decision.decided_at.toISOString(),
        };
      });

      return {
        eventId: row.event_id,
        changeType: row.change_type,
        occurredAt: row.occurred_at.toISOString(),
        changedFields: row.changed_fields,
        previousApiModelId: row.previous_api_model_id,
        currentApiModelId: row.current_api_model_id,
        previousSource,
        currentSource,
        review: {
          status: row.review_status ?? "open",
          acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
          resolvedAt: row.resolved_at?.toISOString() ?? null,
          decisions,
        },
      };
    });

    timeline.sort(
      (left, right) =>
        left.occurredAt.localeCompare(right.occurredAt) ||
        left.id.localeCompare(right.id),
    );

    return {
      model: {
        id: model.id,
        provider: {
          id: model.provider_id,
          slug: model.provider_slug,
          name: model.provider_name,
        },
        canonicalSlug: model.canonical_slug,
        marketingName: model.marketing_name,
        status: model.status,
      },
      candidates,
      drift,
      timeline,
    };
  }
}
