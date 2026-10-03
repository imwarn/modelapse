import { Pool, type PoolClient } from "pg";

export type CatalogDriftReviewStatus = "open" | "acknowledged" | "resolved";
export type CatalogDriftReviewAction = "acknowledge" | "resolve" | "reopen";

export interface CatalogDriftReviewItem {
  readonly eventId: string;
  readonly changeType: string;
  readonly occurredAt: string;
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly model: { readonly id: string; readonly canonicalSlug: string; readonly marketingName: string } | null;
  readonly alias: string | null;
  readonly previousApiModelId: string | null;
  readonly currentApiModelId: string | null;
  readonly changedFields: readonly string[];
  readonly previousSource: { readonly id: string; readonly url: string | null; readonly title: string | null } | null;
  readonly currentSource: { readonly id: string; readonly url: string | null; readonly title: string | null } | null;
  readonly review: {
    readonly status: CatalogDriftReviewStatus;
    readonly acknowledgedAt: string | null;
    readonly resolvedAt: string | null;
    readonly latestDecision: {
      readonly id: string;
      readonly action: CatalogDriftReviewAction;
      readonly actor: string;
      readonly note: string | null;
      readonly decidedAt: string;
    } | null;
  };
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(name + " must be non-empty");
  return normalized;
}

async function driftExists(client: PoolClient, eventId: string): Promise<boolean> {
  const result = await client.query<{ present: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM modelapse.catalog_identity_drift_events WHERE event_id = $1
     ) AS present`,
    [eventId],
  );
  return result.rows[0]?.present === true;
}

export class PgCatalogDriftReview {
  constructor(private readonly pool: Pool) {}

  static connect(connectionString: string, options: { readonly max?: number } = {}): PgCatalogDriftReview {
    return new PgCatalogDriftReview(new Pool({ connectionString, max: options.max ?? 2 }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async list(input: { readonly status?: CatalogDriftReviewStatus; readonly limit?: number } = {}): Promise<readonly CatalogDriftReviewItem[]> {
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("limit must be between 1 and 200");
    const status = input.status;
    if (status && !["open", "acknowledged", "resolved"].includes(status)) throw new Error("Unsupported drift review status");

    const result = await this.pool.query<{
      event_id: string; change_type: string; occurred_at: Date;
      provider_id: string; provider_slug: string; provider_name: string;
      current_model_id: string | null; canonical_slug: string | null; marketing_name: string | null;
      alias: string | null; previous_api_model_id: string | null; current_api_model_id: string | null;
      changed_fields: string[]; previous_source_id: string | null; previous_source_url: string | null; previous_source_title: string | null;
      current_source_id: string | null; current_source_url: string | null; current_source_title: string | null;
      review_status: CatalogDriftReviewStatus | null; acknowledged_at: Date | null; resolved_at: Date | null;
      decision_id: string | null; decision_action: CatalogDriftReviewAction | null; decision_actor: string | null; decision_note: string | null; decision_decided_at: Date | null;
    }>(
      `SELECT drift.event_id, drift.change_type, drift.occurred_at,
              provider.id AS provider_id, provider.slug AS provider_slug, provider.name AS provider_name,
              drift.current_model_id, model.canonical_slug, model.marketing_name,
              drift.alias, drift.previous_api_model_id, drift.current_api_model_id, drift.changed_fields,
              previous_source.id AS previous_source_id, previous_source.url AS previous_source_url, previous_source.title AS previous_source_title,
              current_source.id AS current_source_id, current_source.url AS current_source_url, current_source.title AS current_source_title,
              review.status AS review_status, review.acknowledged_at, review.resolved_at,
              decision.id AS decision_id, decision.action AS decision_action, decision.actor AS decision_actor,
              decision.note AS decision_note, decision.decided_at AS decision_decided_at
         FROM modelapse.catalog_identity_drift_events drift
         JOIN modelapse.providers provider ON provider.id = drift.provider_id
         LEFT JOIN modelapse.models model ON model.id = drift.current_model_id
         LEFT JOIN modelapse.source_records previous_source ON previous_source.id = drift.previous_source_id
         LEFT JOIN modelapse.source_records current_source ON current_source.id = drift.current_source_id
         LEFT JOIN modelapse.catalog_identity_drift_reviews review ON review.drift_event_id = drift.event_id
         LEFT JOIN LATERAL (
           SELECT event.*
             FROM modelapse.catalog_identity_drift_review_events event
            WHERE event.drift_event_id = drift.event_id
            ORDER BY event.created_at DESC, event.id DESC
            LIMIT 1
         ) decision ON true
        WHERE ($1::text IS NULL OR COALESCE(review.status, 'open') = $1)
        ORDER BY drift.occurred_at DESC, drift.event_id DESC
        LIMIT $2`,
      [status ?? null, limit],
    );

    return result.rows.map((row) => ({
      eventId: row.event_id,
      changeType: row.change_type,
      occurredAt: row.occurred_at.toISOString(),
      provider: { id: row.provider_id, slug: row.provider_slug, name: row.provider_name },
      model: row.current_model_id && row.canonical_slug && row.marketing_name ? {
        id: row.current_model_id, canonicalSlug: row.canonical_slug, marketingName: row.marketing_name,
      } : null,
      alias: row.alias,
      previousApiModelId: row.previous_api_model_id,
      currentApiModelId: row.current_api_model_id,
      changedFields: row.changed_fields,
      previousSource: row.previous_source_id ? { id: row.previous_source_id, url: row.previous_source_url, title: row.previous_source_title } : null,
      currentSource: row.current_source_id ? { id: row.current_source_id, url: row.current_source_url, title: row.current_source_title } : null,
      review: {
        status: row.review_status ?? "open",
        acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
        resolvedAt: row.resolved_at?.toISOString() ?? null,
        latestDecision: row.decision_id && row.decision_action && row.decision_actor && row.decision_decided_at ? {
          id: row.decision_id, action: row.decision_action, actor: row.decision_actor,
          note: row.decision_note, decidedAt: row.decision_decided_at.toISOString(),
        } : null,
      },
    }));
  }

  async decide(input: { readonly eventId: string; readonly action: CatalogDriftReviewAction; readonly actor: string; readonly note?: string }): Promise<{ readonly eventId: string; readonly eventAuditId: string; readonly status: CatalogDriftReviewStatus }> {
    const eventId = nonEmpty(input.eventId, "eventId");
    const actor = nonEmpty(input.actor, "actor");
    const note = input.note?.trim() || null;
    if (!["acknowledge", "resolve", "reopen"].includes(input.action)) throw new Error("Unsupported drift review action");

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["modelapse:drift-review:" + eventId]);
      if (!(await driftExists(client, eventId))) throw new Error("Catalog identity drift event not found");

      const current = await client.query<{ status: CatalogDriftReviewStatus }>(
        `SELECT status FROM modelapse.catalog_identity_drift_reviews WHERE drift_event_id = $1 FOR UPDATE`, [eventId],
      );
      const currentStatus = current.rows[0]?.status ?? "open";
      const nextStatus: CatalogDriftReviewStatus =
        input.action === "acknowledge" ? "acknowledged" : input.action === "resolve" ? "resolved" : "open";
      if (input.action === "acknowledge" && currentStatus !== "open") throw new Error("Only open drift can be acknowledged");
      if (input.action === "resolve" && currentStatus === "resolved") throw new Error("Drift is already resolved");
      if (input.action === "reopen" && currentStatus === "open") throw new Error("Drift is already open");

      const audit = await client.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_identity_drift_review_events
           (drift_event_id, action, actor, note, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id`,
        [eventId, input.action, actor, note, JSON.stringify({ previousStatus: currentStatus, nextStatus })],
      );
      await client.query(
        `INSERT INTO modelapse.catalog_identity_drift_reviews
           (drift_event_id, status, acknowledged_at, resolved_at, updated_at)
         VALUES (
           $1, $2,
           CASE WHEN $2 = 'acknowledged' THEN now() ELSE NULL END,
           CASE WHEN $2 = 'resolved' THEN now() ELSE NULL END,
           now()
         )
         ON CONFLICT (drift_event_id) DO UPDATE SET
           status = EXCLUDED.status,
           acknowledged_at = CASE
             WHEN EXCLUDED.status = 'acknowledged' THEN COALESCE(catalog_identity_drift_reviews.acknowledged_at, now())
             WHEN EXCLUDED.status = 'resolved' THEN catalog_identity_drift_reviews.acknowledged_at
             ELSE NULL
           END,
           resolved_at = CASE WHEN EXCLUDED.status = 'resolved' THEN now() ELSE NULL END,
           updated_at = now()`,
        [eventId, nextStatus],
      );
      await client.query("COMMIT");
      return { eventId, eventAuditId: audit.rows[0]!.id, status: nextStatus };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
