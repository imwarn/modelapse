import { Pool, type PoolClient } from "pg";
import {
  PgCatalogPresence,
  type CatalogPresenceCurrentContext,
  type CatalogPresenceHistory,
} from "./catalog-presence.js";

export type CatalogPresenceReviewStatus = "open" | "acknowledged" | "resolved";
export type CatalogPresenceReviewAction = "acknowledge" | "resolve" | "reopen";

export interface CatalogPresenceReviewItem {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly interpretation: "not_observed_in_complete_model_list_evidence";
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly observerSource: {
    readonly id: string;
    readonly sourceKey: string;
    readonly title: string;
    readonly url: string;
  };
  readonly runId: string;
  readonly previousCompleteRunId: string | null;
  readonly remoteModelId: string;
  readonly currentContext: CatalogPresenceCurrentContext;
  readonly review: {
    readonly status: CatalogPresenceReviewStatus;
    readonly acknowledgedAt: string | null;
    readonly resolvedAt: string | null;
    readonly latestDecision: {
      readonly id: string;
      readonly action: CatalogPresenceReviewAction;
      readonly actor: string;
      readonly note: string | null;
      readonly decidedAt: string;
    } | null;
  };
}

interface StoredReviewRow {
  presence_event_id: string;
  provider_id: string;
  provider_slug: string;
  provider_name: string;
  observer_source_id: string;
  source_key: string;
  source_title: string;
  source_url: string;
  run_id: string;
  previous_complete_run_id: string | null;
  remote_model_id: string;
  occurred_at: Date;
  status: CatalogPresenceReviewStatus;
  acknowledged_at: Date | null;
  resolved_at: Date | null;
  decision_id: string | null;
  decision_action: CatalogPresenceReviewAction | null;
  decision_actor: string | null;
  decision_note: string | null;
  decision_decided_at: Date | null;
  model_id: string | null;
  canonical_slug: string | null;
  marketing_name: string | null;
  candidate_id: string | null;
  candidate_status: "discovered" | "matched" | "ignored" | "promotion_ready" | null;
  candidate_resolved_model_id: string | null;
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(name + " must be non-empty");
  return normalized;
}

function currentContextFromRow(
  row: Pick<
    StoredReviewRow,
    | "model_id"
    | "canonical_slug"
    | "marketing_name"
    | "candidate_id"
    | "candidate_status"
    | "candidate_resolved_model_id"
  >,
): CatalogPresenceCurrentContext {
  return {
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
  };
}

export class PgCatalogPresenceReview {
  private readonly presence: PgCatalogPresence;

  constructor(private readonly pool: Pool) {
    this.presence = new PgCatalogPresence(pool);
  }

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgCatalogPresenceReview {
    return new PgCatalogPresenceReview(
      new Pool({ connectionString, max: options.max ?? 3 }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async storedReviews(): Promise<readonly CatalogPresenceReviewItem[]> {
    const result = await this.pool.query<StoredReviewRow>(
      `SELECT
         review.presence_event_id,
         review.provider_id,
         provider.slug AS provider_slug,
         provider.name AS provider_name,
         review.observer_source_id,
         observer.source_key,
         observer.title AS source_title,
         observer.url AS source_url,
         review.run_id,
         review.previous_complete_run_id,
         review.remote_model_id,
         review.occurred_at,
         review.status,
         review.acknowledged_at,
         review.resolved_at,
         decision.id AS decision_id,
         decision.action AS decision_action,
         decision.actor AS decision_actor,
         decision.note AS decision_note,
         decision.decided_at AS decision_decided_at,
         current_alias.model_id,
         current_alias.canonical_slug,
         current_alias.marketing_name,
         candidate.id AS candidate_id,
         candidate.status AS candidate_status,
         candidate.resolved_model_id AS candidate_resolved_model_id
       FROM modelapse.catalog_presence_reviews review
       JOIN modelapse.providers provider ON provider.id = review.provider_id
       JOIN modelapse.catalog_observer_sources observer
         ON observer.id = review.observer_source_id
       LEFT JOIN LATERAL (
         SELECT event.*
           FROM modelapse.catalog_presence_review_events event
          WHERE event.presence_event_id = review.presence_event_id
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 1
       ) decision ON true
       LEFT JOIN LATERAL (
         SELECT model.id AS model_id, model.canonical_slug, model.marketing_name
           FROM modelapse.model_aliases alias
           JOIN modelapse.alias_resolution_events event
             ON event.alias_id = alias.id
           JOIN modelapse.models model
             ON model.id = event.resolved_model_id
          WHERE alias.provider_id = review.provider_id
            AND alias.alias = review.remote_model_id
          ORDER BY event.observed_at DESC, event.id DESC
          LIMIT 1
       ) current_alias ON true
       LEFT JOIN modelapse.catalog_discovery_candidates candidate
         ON candidate.provider_id = review.provider_id
        AND candidate.remote_model_id = review.remote_model_id
       ORDER BY review.occurred_at DESC, review.presence_event_id DESC`,
    );

    return result.rows.map((row) => ({
      eventId: row.presence_event_id,
      occurredAt: row.occurred_at.toISOString(),
      interpretation: "not_observed_in_complete_model_list_evidence",
      provider: {
        id: row.provider_id,
        slug: row.provider_slug,
        name: row.provider_name,
      },
      observerSource: {
        id: row.observer_source_id,
        sourceKey: row.source_key,
        title: row.source_title,
        url: row.source_url,
      },
      runId: row.run_id,
      previousCompleteRunId: row.previous_complete_run_id,
      remoteModelId: row.remote_model_id,
      currentContext: currentContextFromRow(row),
      review: {
        status: row.status,
        acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
        resolvedAt: row.resolved_at?.toISOString() ?? null,
        latestDecision:
          row.decision_id &&
          row.decision_action &&
          row.decision_actor &&
          row.decision_decided_at
            ? {
                id: row.decision_id,
                action: row.decision_action,
                actor: row.decision_actor,
                note: row.decision_note,
                decidedAt: row.decision_decided_at.toISOString(),
              }
            : null,
      },
    }));
  }

  private async providerHistories(): Promise<readonly CatalogPresenceHistory[]> {
    const providers = await this.pool.query<{ id: string }>(
      `SELECT DISTINCT provider_id AS id
         FROM modelapse.catalog_observer_sources
        WHERE source_kind = 'model_list'
        ORDER BY provider_id`,
    );
    const histories = await Promise.all(
      providers.rows.map((provider) =>
        this.presence.getProvider(provider.id, { runLimit: 100 }),
      ),
    );
    return histories.filter(
      (history): history is CatalogPresenceHistory => history !== null,
    );
  }

  async list(
    input: {
      readonly status?: CatalogPresenceReviewStatus;
      readonly limit?: number;
    } = {},
  ): Promise<readonly CatalogPresenceReviewItem[]> {
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("limit must be between 1 and 200");
    }
    if (
      input.status &&
      !["open", "acknowledged", "resolved"].includes(input.status)
    ) {
      throw new Error("Unsupported catalog presence review status");
    }

    const [stored, histories] = await Promise.all([
      this.storedReviews(),
      this.providerHistories(),
    ]);

    const byEventId = new Map(stored.map((item) => [item.eventId, item]));
    for (const history of histories) {
      const sourceById = new Map(history.sources.map((source) => [source.id, source]));
      for (const event of history.events) {
        if (event.kind !== "not_observed_in_complete_snapshot") continue;
        if (byEventId.has(event.id)) continue;
        const source = sourceById.get(event.observerSourceId);
        if (!source) continue;
        byEventId.set(event.id, {
          eventId: event.id,
          occurredAt: event.occurredAt,
          interpretation: "not_observed_in_complete_model_list_evidence",
          provider: history.provider,
          observerSource: {
            id: source.id,
            sourceKey: source.sourceKey,
            title: source.title,
            url: source.url,
          },
          runId: event.runId,
          previousCompleteRunId: event.previousCompleteRunId,
          remoteModelId: event.remoteModelId,
          currentContext: event.currentContext,
          review: {
            status: "open",
            acknowledgedAt: null,
            resolvedAt: null,
            latestDecision: null,
          },
        });
      }
    }

    return [...byEventId.values()]
      .filter((item) => !input.status || item.review.status === input.status)
      .sort((a, b) => {
        const byTime = b.occurredAt.localeCompare(a.occurredAt);
        return byTime !== 0 ? byTime : b.eventId.localeCompare(a.eventId);
      })
      .slice(0, limit);
  }

  private async deriveEvent(
    providerId: string,
    eventId: string,
  ): Promise<CatalogPresenceReviewItem | null> {
    const history = await this.presence.getProvider(providerId, { runLimit: 100 });
    if (!history) return null;
    const sourceById = new Map(history.sources.map((source) => [source.id, source]));
    const event = history.events.find(
      (candidate) =>
        candidate.id === eventId &&
        candidate.kind === "not_observed_in_complete_snapshot",
    );
    if (!event) return null;
    const source = sourceById.get(event.observerSourceId);
    if (!source) return null;
    return {
      eventId: event.id,
      occurredAt: event.occurredAt,
      interpretation: "not_observed_in_complete_model_list_evidence",
      provider: history.provider,
      observerSource: {
        id: source.id,
        sourceKey: source.sourceKey,
        title: source.title,
        url: source.url,
      },
      runId: event.runId,
      previousCompleteRunId: event.previousCompleteRunId,
      remoteModelId: event.remoteModelId,
      currentContext: event.currentContext,
      review: {
        status: "open",
        acknowledgedAt: null,
        resolvedAt: null,
        latestDecision: null,
      },
    };
  }

  async decide(input: {
    readonly providerId: string;
    readonly eventId: string;
    readonly action: CatalogPresenceReviewAction;
    readonly actor: string;
    readonly note?: string;
  }): Promise<{
    readonly eventId: string;
    readonly eventAuditId: string;
    readonly status: CatalogPresenceReviewStatus;
  }> {
    const providerId = nonEmpty(input.providerId, "providerId");
    const eventId = nonEmpty(input.eventId, "eventId");
    const actor = nonEmpty(input.actor, "actor");
    const note = input.note?.trim() || null;
    if (!["acknowledge", "resolve", "reopen"].includes(input.action)) {
      throw new Error("Unsupported catalog presence review action");
    }

    const preexisting = await this.pool.query<{
      provider_id: string;
      status: CatalogPresenceReviewStatus;
    }>(
      `SELECT provider_id, status
         FROM modelapse.catalog_presence_reviews
        WHERE presence_event_id = $1`,
      [eventId],
    );
    const derived =
      preexisting.rows[0] === undefined
        ? await this.deriveEvent(providerId, eventId)
        : null;
    if (!preexisting.rows[0] && !derived) {
      throw new Error("Catalog presence absence event not found");
    }
    if (preexisting.rows[0] && preexisting.rows[0].provider_id !== providerId) {
      throw new Error("Catalog presence event provider mismatch");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "modelapse:presence-review:" + eventId,
      ]);

      let current = await client.query<{
        provider_id: string;
        status: CatalogPresenceReviewStatus;
      }>(
        `SELECT provider_id, status
           FROM modelapse.catalog_presence_reviews
          WHERE presence_event_id = $1
          FOR UPDATE`,
        [eventId],
      );

      if (current.rows[0] && current.rows[0].provider_id !== providerId) {
        throw new Error("Catalog presence event provider mismatch");
      }

      if (!current.rows[0]) {
        if (!derived) {
          throw new Error("Catalog presence absence event not found");
        }
        await client.query(
          `INSERT INTO modelapse.catalog_presence_reviews
            (
              presence_event_id,
              provider_id,
              observer_source_id,
              run_id,
              previous_complete_run_id,
              remote_model_id,
              occurred_at,
              status
            )
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')`,
          [
            derived.eventId,
            derived.provider.id,
            derived.observerSource.id,
            derived.runId,
            derived.previousCompleteRunId,
            derived.remoteModelId,
            derived.occurredAt,
          ],
        );
        current = {
          rows: [{ provider_id: providerId, status: "open" }],
        } as typeof current;
      }

      const currentStatus = current.rows[0]!.status;
      const nextStatus: CatalogPresenceReviewStatus =
        input.action === "acknowledge"
          ? "acknowledged"
          : input.action === "resolve"
            ? "resolved"
            : "open";

      if (input.action === "acknowledge" && currentStatus !== "open") {
        throw new Error("Only open catalog presence events can be acknowledged");
      }
      if (input.action === "resolve" && currentStatus === "resolved") {
        throw new Error("Catalog presence event is already resolved");
      }
      if (input.action === "reopen" && currentStatus === "open") {
        throw new Error("Catalog presence event is already open");
      }

      const audit = await client.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_presence_review_events
           (presence_event_id, action, actor, note, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         RETURNING id`,
        [
          eventId,
          input.action,
          actor,
          note,
          JSON.stringify({
            previousStatus: currentStatus,
            nextStatus,
            interpretation: "not_observed_in_complete_model_list_evidence",
          }),
        ],
      );

      await client.query(
        `UPDATE modelapse.catalog_presence_reviews
            SET status = $2,
                acknowledged_at = CASE
                  WHEN $2 = 'acknowledged' THEN COALESCE(acknowledged_at, now())
                  WHEN $2 = 'resolved' THEN acknowledged_at
                  ELSE NULL
                END,
                resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE NULL END,
                updated_at = now()
          WHERE presence_event_id = $1`,
        [eventId, nextStatus],
      );

      await client.query("COMMIT");
      return {
        eventId,
        eventAuditId: audit.rows[0]!.id,
        status: nextStatus,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
