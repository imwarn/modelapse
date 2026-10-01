import { Pool, type PoolClient } from "pg";
import type { ObservedRemoteModel } from "./catalog-adapter.js";
import { PgModelCatalogAdmin } from "./model-catalog.js";

export type CatalogDiscoveryStatus =
  | "discovered"
  | "matched"
  | "ignored"
  | "promotion_ready";

export type CatalogReconciliationAction =
  | "match_existing"
  | "ignore"
  | "mark_promotion_ready"
  | "reopen";

export interface CatalogDiscoveryCandidate {
  readonly id: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly remoteModelId: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly latestProviderSnapshotId: string | null;
  readonly observationCount: number;
  readonly status: CatalogDiscoveryStatus;
  readonly resolvedModel: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
  } | null;
  readonly resolvedAt: string | null;
  readonly lastSource: {
    readonly id: string;
    readonly sourceType: string;
    readonly url: string | null;
    readonly title: string | null;
    readonly retrievedAt: string;
    readonly contentSha256: string | null;
  };
  readonly promotion: {
    readonly id: string;
    readonly promotedAt: string;
    readonly actor: string;
    readonly modelId: string;
  } | null;
  readonly latestDecision: {
    readonly id: string;
    readonly action: CatalogReconciliationAction;
    readonly decidedAt: string;
    readonly actor: string;
    readonly note: string | null;
  } | null;
}

function normalizedTime(value: string | undefined, name: string): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(name + " must be an ISO-8601 timestamp");
  }
  return parsed.toISOString();
}

function nonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(name + " must be non-empty");
  return normalized;
}

async function lockCandidate(
  client: PoolClient,
  candidateId: string,
): Promise<{
  id: string;
  provider_id: string;
  remote_model_id: string;
  status: CatalogDiscoveryStatus;
}> {
  const result = await client.query<{
    id: string;
    provider_id: string;
    remote_model_id: string;
    status: CatalogDiscoveryStatus;
  }>(
    `SELECT id, provider_id, remote_model_id, status
       FROM modelapse.catalog_discovery_candidates
      WHERE id = $1
      FOR UPDATE`,
    [candidateId],
  );
  const candidate = result.rows[0];
  if (!candidate) throw new Error("Catalog discovery candidate not found");
  return candidate;
}

export class PgCatalogDiscovery {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgCatalogDiscovery {
    return new PgCatalogDiscovery(
      new Pool({
        connectionString,
        max: options.max ?? 2,
      }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async recordUnmatchedRemoteModels(input: {
    readonly providerId: string;
    readonly collectionRunId: string;
    readonly sourceRecordId: string;
    readonly observedAt: string;
    readonly remoteModels: readonly ObservedRemoteModel[];
    readonly matchedRemoteModelIds: ReadonlySet<string>;
  }): Promise<readonly string[]> {
    const observedAt = normalizedTime(input.observedAt, "observedAt");
    const unmatched = input.remoteModels.filter(
      (model) => !input.matchedRemoteModelIds.has(model.id),
    );
    if (unmatched.length === 0) return [];

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const candidateIds: string[] = [];

      for (const remote of unmatched) {
        const remoteModelId = nonEmpty(remote.id, "remote model id");
        const insertedCandidate = await client.query<{ id: string }>(
          `INSERT INTO modelapse.catalog_discovery_candidates
            (
              provider_id,
              remote_model_id,
              first_seen_at,
              last_seen_at,
              first_source_record_id,
              last_source_record_id,
              first_collection_run_id,
              last_collection_run_id,
              latest_provider_snapshot_id,
              observation_count
            )
           VALUES ($1, $2, $3, $3, $4, $4, $5, $5, $6, 1)
           ON CONFLICT (provider_id, remote_model_id) DO NOTHING
           RETURNING id`,
          [
            input.providerId,
            remoteModelId,
            observedAt,
            input.sourceRecordId,
            input.collectionRunId,
            remote.providerSnapshotId,
          ],
        );

        let candidateId = insertedCandidate.rows[0]?.id;
        let newlyCreated = Boolean(candidateId);

        if (!candidateId) {
          const existing = await client.query<{ id: string }>(
            `SELECT id
               FROM modelapse.catalog_discovery_candidates
              WHERE provider_id = $1
                AND remote_model_id = $2
              FOR UPDATE`,
            [input.providerId, remoteModelId],
          );
          candidateId = existing.rows[0]?.id;
        }
        if (!candidateId) {
          throw new Error("Catalog discovery candidate could not be resolved");
        }

        const observation = await client.query<{ id: string }>(
          `INSERT INTO modelapse.catalog_discovery_observations
            (
              candidate_id,
              collection_run_id,
              source_record_id,
              observed_at,
              provider_snapshot_id
            )
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (candidate_id, collection_run_id) DO NOTHING
           RETURNING id`,
          [
            candidateId,
            input.collectionRunId,
            input.sourceRecordId,
            observedAt,
            remote.providerSnapshotId,
          ],
        );

        if (!observation.rows[0] && newlyCreated) {
          throw new Error(
            "New catalog discovery candidate is missing its first observation",
          );
        }

        if (observation.rows[0] && !newlyCreated) {
          await client.query(
            `UPDATE modelapse.catalog_discovery_candidates
                SET first_seen_at = LEAST(first_seen_at, $2::timestamptz),
                    first_source_record_id =
                      CASE
                        WHEN $2::timestamptz < first_seen_at THEN $3
                        ELSE first_source_record_id
                      END,
                    first_collection_run_id =
                      CASE
                        WHEN $2::timestamptz < first_seen_at THEN $4
                        ELSE first_collection_run_id
                      END,
                    last_source_record_id =
                      CASE
                        WHEN $2::timestamptz >= last_seen_at THEN $3
                        ELSE last_source_record_id
                      END,
                    last_collection_run_id =
                      CASE
                        WHEN $2::timestamptz >= last_seen_at THEN $4
                        ELSE last_collection_run_id
                      END,
                    latest_provider_snapshot_id =
                      CASE
                        WHEN $2::timestamptz >= last_seen_at
                          THEN COALESCE($5, latest_provider_snapshot_id)
                        ELSE latest_provider_snapshot_id
                      END,
                    last_seen_at = GREATEST(last_seen_at, $2::timestamptz),
                    observation_count = observation_count + 1,
                    updated_at = now()
              WHERE id = $1`,
            [
              candidateId,
              observedAt,
              input.sourceRecordId,
              input.collectionRunId,
              remote.providerSnapshotId,
            ],
          );
        }

        candidateIds.push(candidateId);
      }

      await client.query("COMMIT");
      return candidateIds;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listCandidates(input: {
    readonly providerSlug?: string;
    readonly status?: CatalogDiscoveryStatus;
    readonly limit?: number;
  } = {}): Promise<readonly CatalogDiscoveryCandidate[]> {
    if (
      input.status &&
      !["discovered", "matched", "ignored", "promotion_ready"].includes(
        input.status,
      )
    ) {
      throw new Error("Unsupported catalog discovery status: " + input.status);
    }

    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new Error(
        "Catalog discovery limit must be an integer between 1 and 200",
      );
    }

    const result = await this.pool.query<{
      id: string;
      provider_id: string;
      provider_slug: string;
      provider_name: string;
      remote_model_id: string;
      first_seen_at: Date;
      last_seen_at: Date;
      latest_provider_snapshot_id: string | null;
      observation_count: string;
      status: CatalogDiscoveryStatus;
      resolved_model_id: string | null;
      resolved_canonical_slug: string | null;
      resolved_marketing_name: string | null;
      resolved_at: Date | null;
      source_id: string;
      source_type: string;
      source_url: string | null;
      source_title: string | null;
      source_retrieved_at: Date;
      source_content_sha256: string | null;
      decision_id: string | null;
      decision_action: CatalogReconciliationAction | null;
      decision_decided_at: Date | null;
      decision_actor: string | null;
      decision_note: string | null;
      promotion_id: string | null;
      promotion_promoted_at: Date | null;
      promotion_actor: string | null;
      promotion_model_id: string | null;
    }>(
      `SELECT
         candidate.id,
         provider.id AS provider_id,
         provider.slug AS provider_slug,
         provider.name AS provider_name,
         candidate.remote_model_id,
         candidate.first_seen_at,
         candidate.last_seen_at,
         candidate.latest_provider_snapshot_id,
         candidate.observation_count::text,
         candidate.status,
         model.id AS resolved_model_id,
         model.canonical_slug AS resolved_canonical_slug,
         model.marketing_name AS resolved_marketing_name,
         candidate.resolved_at,
         source.id AS source_id,
         source.source_type,
         source.url AS source_url,
         source.title AS source_title,
         source.retrieved_at AS source_retrieved_at,
         source.content_sha256 AS source_content_sha256,
         decision.id AS decision_id,
         decision.action AS decision_action,
         decision.decided_at AS decision_decided_at,
         decision.actor AS decision_actor,
         decision.note AS decision_note,
         promotion.id AS promotion_id,
         promotion.promoted_at AS promotion_promoted_at,
         promotion.actor AS promotion_actor,
         promotion.model_id AS promotion_model_id
       FROM modelapse.catalog_discovery_candidates candidate
       JOIN modelapse.providers provider
         ON provider.id = candidate.provider_id
       JOIN modelapse.source_records source
         ON source.id = candidate.last_source_record_id
       LEFT JOIN modelapse.models model
         ON model.id = candidate.resolved_model_id
       LEFT JOIN modelapse.catalog_promotion_events promotion
         ON promotion.candidate_id = candidate.id
       LEFT JOIN LATERAL (
         SELECT event.*
           FROM modelapse.catalog_reconciliation_events event
          WHERE event.candidate_id = candidate.id
          ORDER BY event.created_at DESC, event.id DESC
          LIMIT 1
       ) decision ON true
      WHERE ($1::text IS NULL OR provider.slug = $1)
        AND ($2::text IS NULL OR candidate.status = $2)
      ORDER BY candidate.last_seen_at DESC, candidate.id
      LIMIT $3`,
      [
        input.providerSlug?.trim() || null,
        input.status ?? null,
        limit,
      ],
    );

    return result.rows.map((row) => ({
      id: row.id,
      provider: {
        id: row.provider_id,
        slug: row.provider_slug,
        name: row.provider_name,
      },
      remoteModelId: row.remote_model_id,
      firstSeenAt: row.first_seen_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
      latestProviderSnapshotId: row.latest_provider_snapshot_id,
      observationCount: Number(row.observation_count),
      status: row.status,
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
      resolvedAt: row.resolved_at?.toISOString() ?? null,
      lastSource: {
        id: row.source_id,
        sourceType: row.source_type,
        url: row.source_url,
        title: row.source_title,
        retrievedAt: row.source_retrieved_at.toISOString(),
        contentSha256: row.source_content_sha256,
      },
      promotion:
        row.promotion_id &&
        row.promotion_promoted_at &&
        row.promotion_actor &&
        row.promotion_model_id
          ? {
              id: row.promotion_id,
              promotedAt: row.promotion_promoted_at.toISOString(),
              actor: row.promotion_actor,
              modelId: row.promotion_model_id,
            }
          : null,
      latestDecision:
        row.decision_id &&
        row.decision_action &&
        row.decision_decided_at &&
        row.decision_actor
          ? {
              id: row.decision_id,
              action: row.decision_action,
              decidedAt: row.decision_decided_at.toISOString(),
              actor: row.decision_actor,
              note: row.decision_note,
            }
          : null,
    }));
  }

  async promoteCandidate(input: {
    readonly candidateId: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly status?: "preview" | "active";
    readonly actor: string;
    readonly note?: string;
  }): Promise<{
    readonly candidateId: string;
    readonly modelId: string;
    readonly promotionEventId: string;
    readonly reconciliationEventId: string;
  }> {
    const candidateId = nonEmpty(input.candidateId, "candidateId");
    const canonicalSlug = nonEmpty(input.canonicalSlug, "canonicalSlug");
    const marketingName = nonEmpty(input.marketingName, "marketingName");
    const actor = nonEmpty(input.actor, "actor");
    const note = input.note?.trim() || null;
    const status = input.status ?? "active";

    if (!/^[a-z0-9][a-z0-9-]*$/.test(canonicalSlug)) {
      throw new Error("canonicalSlug must use lowercase letters, digits, and hyphens");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        ["modelapse:catalog-promotion:" + candidateId],
      );

      const candidateResult = await client.query<{
        id: string;
        provider_id: string;
        provider_slug: string;
        remote_model_id: string;
        status: CatalogDiscoveryStatus;
        last_source_record_id: string;
        source_type: string;
        source_url: string | null;
        source_title: string | null;
      }>(
        `SELECT
           candidate.id,
           candidate.provider_id,
           provider.slug AS provider_slug,
           candidate.remote_model_id,
           candidate.status,
           candidate.last_source_record_id,
           source.source_type,
           source.url AS source_url,
           source.title AS source_title
         FROM modelapse.catalog_discovery_candidates candidate
         JOIN modelapse.providers provider ON provider.id = candidate.provider_id
         JOIN modelapse.source_records source
           ON source.id = candidate.last_source_record_id
        WHERE candidate.id = $1
        FOR UPDATE OF candidate`,
        [candidateId],
      );
      const candidate = candidateResult.rows[0];
      if (!candidate) throw new Error("Catalog discovery candidate not found");
      if (candidate.status !== "promotion_ready") {
        throw new Error("Catalog discovery candidate must be promotion_ready");
      }
      if (candidate.source_type !== "provider_api") {
        throw new Error(
          "Promotion requires a first-party provider_api model-list observation",
        );
      }
      if (!candidate.source_url || !candidate.source_title) {
        throw new Error("Promotion requires a URL-backed first-party source");
      }

      const priorPromotion = await client.query<{ id: string }>(
        `SELECT id
           FROM modelapse.catalog_promotion_events
          WHERE candidate_id = $1`,
        [candidateId],
      );
      if (priorPromotion.rows[0]) {
        throw new Error("Catalog discovery candidate has already been promoted");
      }

      await client.query("COMMIT");

      const modelAdmin = new PgModelCatalogAdmin(this.pool);
      let registration;
      try {
        registration = await modelAdmin.registerFirstPartyModel({
        providerSlug: candidate.provider_slug,
        canonicalSlug,
        marketingName,
        apiModelId: candidate.remote_model_id,
        status,
        sourceUrl: candidate.source_url,
        sourceTitle: candidate.source_title,
        sourceType: candidate.source_type,
        sourceRecordId: candidate.last_source_record_id,
        });
      } catch (error) {
        throw error;
      }

      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        ["modelapse:catalog-promotion:" + candidateId],
      );
      const locked = await lockCandidate(client, candidateId);
      if (locked.status !== "promotion_ready") {
        throw new Error("Catalog discovery candidate changed during promotion");
      }

      const reconciliation = await client.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_reconciliation_events
          (candidate_id, action, resolved_model_id, actor, note, metadata)
         VALUES ($1, 'match_existing', $2, $3, $4, $5::jsonb)
         RETURNING id`,
        [
          candidateId,
          registration.modelId,
          actor,
          note,
          JSON.stringify({
            previousStatus: locked.status,
            remoteModelId: locked.remote_model_id,
            promotion: true,
          }),
        ],
      );
      const reconciliationEventId = reconciliation.rows[0]?.id;
      if (!reconciliationEventId) {
        throw new Error("Promotion reconciliation event insert failed");
      }

      await client.query(
        `UPDATE modelapse.catalog_discovery_candidates
            SET status = 'matched',
                resolved_model_id = $2,
                resolved_at = now(),
                updated_at = now()
          WHERE id = $1`,
        [candidateId, registration.modelId],
      );

      const promotion = await client.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_promotion_events
          (
            candidate_id,
            model_id,
            source_record_id,
            canonical_slug,
            marketing_name,
            model_status,
            actor,
            metadata
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING id`,
        [
          candidateId,
          registration.modelId,
          registration.sourceId,
          canonicalSlug,
          marketingName,
          status,
          actor,
          JSON.stringify({
            remoteModelId: candidate.remote_model_id,
            sourceType: candidate.source_type,
            note,
          }),
        ],
      );
      const promotionEventId = promotion.rows[0]?.id;
      if (!promotionEventId) throw new Error("Catalog promotion event insert failed");

      await client.query("COMMIT");
      return {
        candidateId,
        modelId: registration.modelId,
        promotionEventId,
        reconciliationEventId,
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async reconcileCandidate(input: {
    readonly candidateId: string;
    readonly action: CatalogReconciliationAction;
    readonly resolvedModelId?: string;
    readonly actor: string;
    readonly note?: string;
    readonly decidedAt?: string;
  }): Promise<{ readonly eventId: string; readonly status: CatalogDiscoveryStatus }> {
    if (
      !["match_existing", "ignore", "mark_promotion_ready", "reopen"].includes(
        input.action,
      )
    ) {
      throw new Error("Unsupported catalog reconciliation action: " + input.action);
    }

    const candidateId = nonEmpty(input.candidateId, "candidateId");
    const actor = nonEmpty(input.actor, "actor");
    const note = input.note?.trim() || null;
    const decidedAt = normalizedTime(input.decidedAt, "decidedAt");
    const resolvedModelId = input.resolvedModelId?.trim() || null;

    if (input.action === "match_existing" && !resolvedModelId) {
      throw new Error("match_existing requires resolvedModelId");
    }
    if (input.action !== "match_existing" && resolvedModelId) {
      throw new Error(input.action + " does not accept resolvedModelId");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        ["modelapse:catalog-discovery:" + candidateId],
      );

      const candidate = await lockCandidate(client, candidateId);
      let status: CatalogDiscoveryStatus;
      let modelId: string | null = null;

      if (input.action === "match_existing") {
        const model = await client.query<{ id: string; provider_id: string }>(
          `SELECT id, provider_id
             FROM modelapse.models
            WHERE id = $1`,
          [resolvedModelId],
        );
        const resolved = model.rows[0];
        if (!resolved) throw new Error("Resolved model not found");
        if (resolved.provider_id !== candidate.provider_id) {
          throw new Error(
            "Catalog discovery candidate and resolved model must share a provider",
          );
        }
        status = "matched";
        modelId = resolved.id;
      } else if (input.action === "ignore") {
        status = "ignored";
      } else if (input.action === "mark_promotion_ready") {
        status = "promotion_ready";
      } else {
        status = "discovered";
      }

      const event = await client.query<{ id: string }>(
        `INSERT INTO modelapse.catalog_reconciliation_events
          (
            candidate_id,
            action,
            resolved_model_id,
            decided_at,
            actor,
            note,
            metadata
          )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         RETURNING id`,
        [
          candidate.id,
          input.action,
          modelId,
          decidedAt,
          actor,
          note,
          JSON.stringify({
            previousStatus: candidate.status,
            remoteModelId: candidate.remote_model_id,
          }),
        ],
      );
      const eventId = event.rows[0]?.id;
      if (!eventId) throw new Error("Catalog reconciliation event insert failed");

      await client.query(
        `UPDATE modelapse.catalog_discovery_candidates
            SET status = $2,
                resolved_model_id = $3,
                resolved_at =
                  CASE
                    WHEN $2 = 'matched' THEN $4::timestamptz
                    ELSE NULL::timestamptz
                  END,
                updated_at = now()
          WHERE id = $1`,
        [candidate.id, status, modelId, decidedAt],
      );

      await client.query("COMMIT");
      return { eventId, status };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
