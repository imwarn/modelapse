import { Pool, type PoolClient } from "pg";

export interface FirstPartyModelRegistration {
  readonly sourceId: string;
  readonly providerId: string;
  readonly endpointId: string;
  readonly modelId: string;
  readonly bindingId: string;
  readonly aliasId: string;
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
