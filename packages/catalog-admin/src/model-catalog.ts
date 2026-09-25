import { Pool, type PoolClient } from "pg";

export interface FirstPartyModelRegistration {
  readonly sourceId: string;
  readonly providerId: string;
  readonly endpointId: string;
  readonly modelId: string;
  readonly bindingId: string;
  readonly aliasId: string;
}

export interface FirstPartyIdentityObservation {
  readonly sourceId: string;
  readonly providerId: string;
  readonly endpointId: string;
  readonly modelId: string;
  readonly snapshotId: string | null;
  readonly bindingId: string;
  readonly bindingChanged: boolean;
  readonly aliasId: string;
  readonly aliasObservationId: string;
  readonly observedAt: string;
}

async function ensureSource(
  client: PoolClient,
  input: {
    readonly sourceType: string;
    readonly url: string;
    readonly title: string;
  },
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id
       FROM modelapse.source_records
      WHERE source_type = $1
        AND url = $2
        AND title = $3
      ORDER BY retrieved_at DESC
      LIMIT 1`,
    [input.sourceType, input.url, input.title],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO modelapse.source_records
      (source_type, url, title)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [input.sourceType, input.url, input.title],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("Model source insert did not return an id");
  return id;
}

async function recordSourceObservation(
  client: PoolClient,
  input: {
    readonly sourceType: string;
    readonly url: string;
    readonly title: string;
    readonly retrievedAt: string;
    readonly contentSha256?: string;
  },
): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO modelapse.source_records
      (source_type, url, title, retrieved_at, content_sha256)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      input.sourceType,
      input.url,
      input.title,
      input.retrievedAt,
      input.contentSha256 ?? null,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("Identity observation source insert did not return an id");
  return id;
}

function normalizedObservationTime(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error("observedAt must be an ISO-8601 timestamp");
  }
  return parsed.toISOString();
}

export class PgModelCatalogAdmin {
  constructor(private readonly pool: Pool) {}

  static connect(
    connectionString: string,
    options: { readonly max?: number } = {},
  ): PgModelCatalogAdmin {
    return new PgModelCatalogAdmin(
      new Pool({
        connectionString,
        max: options.max ?? 2,
      }),
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async registerFirstPartyModel(input: {
    readonly providerSlug: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly apiModelId: string;
    readonly status?: "preview" | "active";
    readonly sourceUrl: string;
    readonly sourceTitle: string;
  }): Promise<FirstPartyModelRegistration> {
    const providerSlug = input.providerSlug.trim();
    const canonicalSlug = input.canonicalSlug.trim();
    const marketingName = input.marketingName.trim();
    const apiModelId = input.apiModelId.trim();
    const sourceUrl = input.sourceUrl.trim();
    const sourceTitle = input.sourceTitle.trim();
    const status = input.status ?? "active";

    if (
      !providerSlug ||
      !canonicalSlug ||
      !marketingName ||
      !apiModelId ||
      !sourceUrl ||
      !sourceTitle
    ) {
      throw new Error("First-party model registration fields must be non-empty");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        ["modelapse:model:" + providerSlug + ":" + canonicalSlug],
      );

      const sourceId = await ensureSource(client, {
        sourceType: "provider_docs",
        url: sourceUrl,
        title: sourceTitle,
      });

      const endpoint = await client.query<{
        provider_id: string;
        endpoint_id: string;
      }>(
        `SELECT
           p.id AS provider_id,
           pe.id AS endpoint_id
         FROM modelapse.providers p
         JOIN modelapse.provider_endpoints pe
           ON pe.provider_id = p.id
          AND pe.path = 'first_party_direct'
          AND pe.source_id IS NOT NULL
          AND (pe.valid_from IS NULL OR pe.valid_from <= now())
          AND (pe.valid_to IS NULL OR pe.valid_to > now())
        WHERE p.slug = $1
        ORDER BY pe.valid_from DESC NULLS LAST, pe.id
        LIMIT 1`,
        [providerSlug],
      );

      const providerId = endpoint.rows[0]?.provider_id;
      const endpointId = endpoint.rows[0]?.endpoint_id;
      if (!providerId || !endpointId) {
        throw new Error(
          "Provider does not have a current sourced first-party direct endpoint",
        );
      }

      await client.query(
        `INSERT INTO modelapse.models
          (
            provider_id,
            canonical_slug,
            marketing_name,
            status,
            canonical_source_id
          )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (provider_id, canonical_slug) DO NOTHING`,
        [providerId, canonicalSlug, marketingName, status, sourceId],
      );

      const modelResult = await client.query<{
        id: string;
        marketing_name: string;
        status: string;
        canonical_source_id: string | null;
      }>(
        `SELECT id, marketing_name, status, canonical_source_id
           FROM modelapse.models
          WHERE provider_id = $1
            AND canonical_slug = $2`,
        [providerId, canonicalSlug],
      );

      const model = modelResult.rows[0];
      if (!model) throw new Error("Registered model could not be resolved");
      if (
        model.marketing_name !== marketingName ||
        !["preview", "active"].includes(model.status)
      ) {
        throw new Error(
          "Canonical model identity conflicts with existing catalog data",
        );
      }

      if (!model.canonical_source_id) {
        await client.query(
          `UPDATE modelapse.models
              SET canonical_source_id = $2
            WHERE id = $1
              AND canonical_source_id IS NULL`,
          [model.id, sourceId],
        );
      }

      const existingBinding = await client.query<{
        id: string;
        api_model_id: string;
      }>(
        `SELECT id, api_model_id
           FROM modelapse.model_execution_bindings
          WHERE model_id = $1
            AND endpoint_id = $2
            AND valid_to IS NULL
          LIMIT 1`,
        [model.id, endpointId],
      );

      let bindingId = existingBinding.rows[0]?.id;
      if (existingBinding.rows[0]) {
        if (existingBinding.rows[0].api_model_id !== apiModelId) {
          throw new Error(
            "Canonical model already has a different current execution binding",
          );
        }
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO modelapse.model_execution_bindings
            (model_id, endpoint_id, api_model_id, source_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [model.id, endpointId, apiModelId, sourceId],
        );
        bindingId = inserted.rows[0]?.id;
      }
      if (!bindingId) throw new Error("Model execution binding insert failed");

      await client.query(
        `INSERT INTO modelapse.model_aliases
          (provider_id, alias)
         VALUES ($1, $2)
         ON CONFLICT (provider_id, alias) DO NOTHING`,
        [providerId, apiModelId],
      );

      const alias = await client.query<{ id: string }>(
        `SELECT id
           FROM modelapse.model_aliases
          WHERE provider_id = $1
            AND alias = $2`,
        [providerId, apiModelId],
      );
      const aliasId = alias.rows[0]?.id;
      if (!aliasId) throw new Error("Model alias could not be resolved");

      const observation = await client.query<{ id: string }>(
        `SELECT id
           FROM modelapse.alias_resolution_events
          WHERE alias_id = $1
            AND resolved_model_id = $2
            AND source_id = $3
          ORDER BY observed_at DESC
          LIMIT 1`,
        [aliasId, model.id, sourceId],
      );

      if (!observation.rows[0]) {
        await client.query(
          `INSERT INTO modelapse.alias_resolution_events
            (
              alias_id,
              resolved_model_id,
              observed_at,
              source_type,
              source_id,
              confidence,
              raw_observation
            )
           VALUES ($1, $2, now(), 'provider_docs', $3, 1.0, $4::jsonb)`,
          [
            aliasId,
            model.id,
            sourceId,
            JSON.stringify({
              apiModelId,
              endpointId,
              registration: "catalog-admin",
            }),
          ],
        );
      }

      await client.query("COMMIT");

      return {
        sourceId,
        providerId,
        endpointId,
        modelId: model.id,
        bindingId,
        aliasId,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async observeFirstPartyIdentity(input: {
    readonly providerSlug: string;
    readonly canonicalSlug: string;
    readonly apiModelId: string;
    readonly providerSnapshotId?: string;
    readonly sourceUrl: string;
    readonly sourceTitle: string;
    readonly contentSha256?: string;
    readonly observedAt?: string;
  }): Promise<FirstPartyIdentityObservation> {
    const providerSlug = input.providerSlug.trim();
    const canonicalSlug = input.canonicalSlug.trim();
    const apiModelId = input.apiModelId.trim();
    const providerSnapshotId = input.providerSnapshotId?.trim() || null;
    const sourceUrl = input.sourceUrl.trim();
    const sourceTitle = input.sourceTitle.trim();
    const contentSha256 = input.contentSha256?.trim();
    const observedAt = normalizedObservationTime(input.observedAt);

    if (!providerSlug || !canonicalSlug || !apiModelId || !sourceUrl || !sourceTitle) {
      throw new Error("Identity observation fields must be non-empty");
    }
    if (
      contentSha256 &&
      !/^[0-9a-f]{64}$/.test(contentSha256)
    ) {
      throw new Error("contentSha256 must be a lowercase SHA-256 digest");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1))",
        ["modelapse:identity:" + providerSlug + ":" + canonicalSlug],
      );

      const resolved = await client.query<{
        provider_id: string;
        model_id: string;
        endpoint_id: string;
      }>(
        `SELECT
           p.id AS provider_id,
           m.id AS model_id,
           pe.id AS endpoint_id
         FROM modelapse.providers p
         JOIN modelapse.models m
           ON m.provider_id = p.id
          AND m.canonical_slug = $2
         JOIN modelapse.provider_endpoints pe
           ON pe.provider_id = p.id
          AND pe.path = 'first_party_direct'
          AND pe.source_id IS NOT NULL
          AND (pe.valid_from IS NULL OR pe.valid_from <= $3::timestamptz)
          AND (pe.valid_to IS NULL OR pe.valid_to > $3::timestamptz)
         WHERE p.slug = $1
         ORDER BY pe.valid_from DESC NULLS LAST, pe.id
         LIMIT 1`,
        [providerSlug, canonicalSlug, observedAt],
      );

      const providerId = resolved.rows[0]?.provider_id;
      const modelId = resolved.rows[0]?.model_id;
      const endpointId = resolved.rows[0]?.endpoint_id;
      if (!providerId || !modelId || !endpointId) {
        throw new Error(
          "Canonical model does not have a sourced first-party direct endpoint at observedAt",
        );
      }

      const sourceId = await recordSourceObservation(client, {
        sourceType: "provider_docs",
        url: sourceUrl,
        title: sourceTitle,
        retrievedAt: observedAt,
        ...(contentSha256 ? { contentSha256 } : {}),
      });

      let snapshotId: string | null = null;
      if (providerSnapshotId) {
        const existingSnapshot = await client.query<{ id: string }>(
          `SELECT id
             FROM modelapse.model_snapshots
            WHERE model_id = $1
              AND provider_snapshot_id = $2
            LIMIT 1`,
          [modelId, providerSnapshotId],
        );
        snapshotId = existingSnapshot.rows[0]?.id ?? null;

        if (!snapshotId) {
          const insertedSnapshot = await client.query<{ id: string }>(
            `INSERT INTO modelapse.model_snapshots
              (model_id, provider_snapshot_id, valid_from, source_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [modelId, providerSnapshotId, observedAt, sourceId],
          );
          snapshotId = insertedSnapshot.rows[0]?.id ?? null;
        }
        if (!snapshotId) {
          throw new Error("Provider snapshot observation insert failed");
        }
      }

      const currentBinding = await client.query<{
        id: string;
        endpoint_id: string;
        api_model_id: string;
        snapshot_id: string | null;
        valid_from: Date;
      }>(
        `SELECT
           meb.id,
           meb.endpoint_id,
           meb.api_model_id,
           meb.snapshot_id,
           meb.valid_from
         FROM modelapse.model_execution_bindings meb
         JOIN modelapse.provider_endpoints pe ON pe.id = meb.endpoint_id
         WHERE meb.model_id = $1
           AND pe.path = 'first_party_direct'
           AND meb.valid_to IS NULL
         ORDER BY meb.valid_from DESC, meb.created_at DESC
         FOR UPDATE`,
        [modelId],
      );

      if (currentBinding.rows.length > 1) {
        throw new Error(
          "Canonical model has multiple current first-party direct bindings",
        );
      }

      const current = currentBinding.rows[0];
      let bindingId =
        current?.endpoint_id === endpointId &&
        current.api_model_id === apiModelId &&
        current.snapshot_id === snapshotId
          ? current.id
          : undefined;
      let bindingChanged = false;

      if (current && !bindingId) {
        if (new Date(observedAt) <= current.valid_from) {
          throw new Error(
            "Identity observations must advance beyond the current binding validFrom",
          );
        }

        await client.query(
          `UPDATE modelapse.model_execution_bindings
              SET valid_to = $2
            WHERE id = $1
              AND valid_to IS NULL`,
          [current.id, observedAt],
        );
        bindingId = undefined;
        bindingChanged = true;
      }

      if (!bindingId) {
        const insertedBinding = await client.query<{ id: string }>(
          `INSERT INTO modelapse.model_execution_bindings
            (
              model_id,
              endpoint_id,
              api_model_id,
              snapshot_id,
              valid_from,
              source_id
            )
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [modelId, endpointId, apiModelId, snapshotId, observedAt, sourceId],
        );
        bindingId = insertedBinding.rows[0]?.id;
        bindingChanged = bindingChanged || Boolean(current);
      }
      if (!bindingId) throw new Error("Identity observation binding insert failed");

      await client.query(
        `INSERT INTO modelapse.model_aliases
          (provider_id, alias)
         VALUES ($1, $2)
         ON CONFLICT (provider_id, alias) DO NOTHING`,
        [providerId, apiModelId],
      );

      const alias = await client.query<{ id: string }>(
        `SELECT id
           FROM modelapse.model_aliases
          WHERE provider_id = $1
            AND alias = $2`,
        [providerId, apiModelId],
      );
      const aliasId = alias.rows[0]?.id;
      if (!aliasId) throw new Error("Identity observation alias could not be resolved");

      const latestAliasObservation = await client.query<{ observed_at: Date }>(
        `SELECT observed_at
           FROM modelapse.alias_resolution_events
          WHERE alias_id = $1
          ORDER BY observed_at DESC, id DESC
          LIMIT 1`,
        [aliasId],
      );
      const latestObservedAt = latestAliasObservation.rows[0]?.observed_at;
      if (latestObservedAt && new Date(observedAt) <= latestObservedAt) {
        throw new Error(
          "Identity observations for an alias must be strictly chronological",
        );
      }

      const observation = await client.query<{ id: string }>(
        `INSERT INTO modelapse.alias_resolution_events
          (
            alias_id,
            resolved_model_id,
            resolved_snapshot_id,
            observed_at,
            source_type,
            source_id,
            confidence,
            raw_observation
          )
         VALUES ($1, $2, $3, $4, 'provider_docs', $5, 1.0, $6::jsonb)
         RETURNING id`,
        [
          aliasId,
          modelId,
          snapshotId,
          observedAt,
          sourceId,
          JSON.stringify({
            apiModelId,
            endpointId,
            providerSnapshotId,
            collector: "catalog-admin-identity-observer",
          }),
        ],
      );
      const aliasObservationId = observation.rows[0]?.id;
      if (!aliasObservationId) {
        throw new Error("Alias identity observation insert failed");
      }

      await client.query("COMMIT");

      return {
        sourceId,
        providerId,
        endpointId,
        modelId,
        snapshotId,
        bindingId,
        bindingChanged,
        aliasId,
        aliasObservationId,
        observedAt,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async bootstrapDeepSeekFlash(): Promise<FirstPartyModelRegistration> {
    return this.registerFirstPartyModel({
      providerSlug: "deepseek",
      canonicalSlug: "deepseek-flash",
      marketingName: "DeepSeek Flash",
      apiModelId: "deepseek-flash",
      status: "active",
      sourceUrl: "https://api-docs.deepseek.com/guides/responses_api/",
      sourceTitle: "DeepSeek Responses API guide",
    });
  }
}
