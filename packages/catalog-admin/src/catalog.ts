import type {
  BlobDescriptor,
  BlobStore,
} from "@modelapse/blob-store";
import { Pool, type PoolClient } from "pg";
import {
  OPENAI_SMOKE_CASE_SLUG,
  OPENAI_SMOKE_FAMILY,
  OPENAI_SMOKE_PACK,
  OPENAI_SMOKE_PROMPT,
  OPENAI_SMOKE_VARIANT,
  OPENAI_SMOKE_VERSION,
  rawDefinitionSha256,
} from "./openai-smoke.js";

export interface OpenAISmokeBootstrapResult {
  readonly providerSourceId: string;
  readonly definitionSourceId: string;
  readonly providerId: string;
  readonly endpointId: string;
  readonly testFamilyId: string;
  readonly testVariantId: string;
  readonly testVersionId: string;
  readonly testCaseId: string;
  readonly promptSha256: string;
  readonly definitionSha256: string;
}

async function registerBlob(
  client: PoolClient,
  blob: BlobDescriptor,
): Promise<void> {
  await client.query(
    `INSERT INTO modelapse.blobs
      (sha256, size_bytes, mime_type, object_key, visibility)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (sha256) DO NOTHING`,
    [
      blob.sha256,
      blob.sizeBytes,
      blob.mimeType,
      blob.objectKey,
      blob.visibility,
    ],
  );

  const existing = await client.query<{
    size_bytes: string;
    mime_type: string;
    object_key: string;
    visibility: string;
  }>(
    `SELECT size_bytes, mime_type, object_key, visibility
       FROM modelapse.blobs
      WHERE sha256 = $1`,
    [blob.sha256],
  );

  const row = existing.rows[0];
  if (
    !row ||
    Number(row.size_bytes) !== blob.sizeBytes ||
    row.mime_type !== blob.mimeType ||
    row.object_key !== blob.objectKey ||
    row.visibility !== blob.visibility
  ) {
    throw new Error("Prompt blob descriptor conflicts with PostgreSQL catalog");
  }
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
  if (!id) throw new Error("Source record insert did not return an id");
  return id;
}

async function ensureProvider(
  client: PoolClient,
): Promise<string> {
  await client.query(
    `INSERT INTO modelapse.providers
      (slug, name, homepage)
     VALUES ('openai', 'OpenAI', 'https://openai.com/')
     ON CONFLICT (slug) DO NOTHING`,
  );

  const result = await client.query<{
    id: string;
    name: string;
  }>(
    `SELECT id, name
       FROM modelapse.providers
      WHERE slug = 'openai'`,
  );
  const provider = result.rows[0];
  if (!provider) throw new Error("OpenAI provider could not be resolved");
  if (provider.name !== "OpenAI") {
    throw new Error(
      "Provider slug openai already exists with an incompatible identity",
    );
  }
  return provider.id;
}

async function ensureEndpoint(
  client: PoolClient,
  providerId: string,
  providerSourceId: string,
): Promise<string> {
  const existing = await client.query<{
    id: string;
    hostname: string;
    source_id: string | null;
  }>(
    `SELECT id, hostname, source_id
       FROM modelapse.provider_endpoints
      WHERE provider_id = $1
        AND path = 'first_party_direct'
        AND base_url = 'https://api.openai.com'`,
    [providerId],
  );

  if (existing.rows[0]) {
    if (existing.rows[0].hostname !== "api.openai.com") {
      throw new Error("Existing OpenAI direct endpoint has an incompatible hostname");
    }
    if (!existing.rows[0].source_id) {
      await client.query(
        `UPDATE modelapse.provider_endpoints
            SET source_id = $2
          WHERE id = $1`,
        [existing.rows[0].id, providerSourceId],
      );
    }
    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO modelapse.provider_endpoints
      (provider_id, path, base_url, hostname, valid_from, source_id)
     VALUES (
       $1,
       'first_party_direct',
       'https://api.openai.com',
       'api.openai.com',
       now(),
       $2
     )
     RETURNING id`,
    [providerId, providerSourceId],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error("OpenAI provider endpoint insert failed");
  return id;
}

async function ensureTestFamily(
  client: PoolClient,
  definitionSourceId: string,
): Promise<string> {
  await client.query(
    `INSERT INTO modelapse.test_families
      (slug, name, origin, canonical_source_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (slug) DO NOTHING`,
    [
      OPENAI_SMOKE_FAMILY.slug,
      OPENAI_SMOKE_FAMILY.name,
      OPENAI_SMOKE_FAMILY.origin,
      definitionSourceId,
      JSON.stringify({ purpose: "production-smoke" }),
    ],
  );

  const result = await client.query<{
    id: string;
    name: string;
    origin: string;
    canonical_source_id: string | null;
  }>(
    `SELECT id, name, origin, canonical_source_id
       FROM modelapse.test_families
      WHERE slug = $1`,
    [OPENAI_SMOKE_FAMILY.slug],
  );
  const family = result.rows[0];
  if (!family) throw new Error("Smoke Test Family could not be resolved");
  if (
    family.name !== OPENAI_SMOKE_FAMILY.name ||
    family.origin !== OPENAI_SMOKE_FAMILY.origin
  ) {
    throw new Error("Smoke Test Family slug conflicts with existing catalog data");
  }
  if (!family.canonical_source_id) {
    await client.query(
      `UPDATE modelapse.test_families
          SET canonical_source_id = $2
        WHERE id = $1`,
      [family.id, definitionSourceId],
    );
  }
  return family.id;
}

async function ensureVariant(
  client: PoolClient,
  familyId: string,
): Promise<string> {
  await client.query(
    `INSERT INTO modelapse.test_variants
      (family_id, slug, name, category, artifact_type)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (family_id, slug) DO NOTHING`,
    [
      familyId,
      OPENAI_SMOKE_VARIANT.slug,
      OPENAI_SMOKE_VARIANT.name,
      OPENAI_SMOKE_VARIANT.category,
      OPENAI_SMOKE_VARIANT.artifactType,
    ],
  );

  const result = await client.query<{
    id: string;
    name: string;
    category: string;
    artifact_type: string;
  }>(
    `SELECT id, name, category, artifact_type
       FROM modelapse.test_variants
      WHERE family_id = $1
        AND slug = $2`,
    [familyId, OPENAI_SMOKE_VARIANT.slug],
  );
  const variant = result.rows[0];
  if (!variant) throw new Error("Smoke Test Variant could not be resolved");
  if (
    variant.name !== OPENAI_SMOKE_VARIANT.name ||
    variant.category !== OPENAI_SMOKE_VARIANT.category ||
    variant.artifact_type !== OPENAI_SMOKE_VARIANT.artifactType
  ) {
    throw new Error("Smoke Test Variant conflicts with existing catalog data");
  }
  return variant.id;
}

async function ensureVersionAndCase(
  client: PoolClient,
  variantId: string,
  prompt: BlobDescriptor,
): Promise<{ readonly versionId: string; readonly caseId: string }> {
  const definitionSha256 = rawDefinitionSha256();

  let version = (
    await client.query<{
      id: string;
      status: "draft" | "published" | "retired";
      definition_sha256: string;
    }>(
      `SELECT id, status, definition_sha256
         FROM modelapse.test_versions
        WHERE variant_id = $1
          AND version = $2`,
      [variantId, OPENAI_SMOKE_VERSION],
    )
  ).rows[0];

  if (!version) {
    const inserted = await client.query<{
      id: string;
      status: "draft";
      definition_sha256: string;
    }>(
      `INSERT INTO modelapse.test_versions
        (variant_id, version, status, definition_sha256, license)
       VALUES ($1, $2, 'draft', $3, NULL)
       RETURNING id, status, definition_sha256`,
      [variantId, OPENAI_SMOKE_VERSION, definitionSha256],
    );
    version = inserted.rows[0];
  }

  if (!version) throw new Error("Smoke Test Version could not be resolved");
  if (version.definition_sha256 !== definitionSha256) {
    throw new Error(
      "Smoke Test Version already exists with a different immutable definition",
    );
  }
  if (version.status === "retired") {
    throw new Error("Smoke Test Version is retired and cannot be bootstrapped");
  }

  let testCase = (
    await client.query<{
      id: string;
      case_type: string;
      visibility: string;
      status: string;
      prompt_blob_sha256: string;
    }>(
      `SELECT id, case_type, visibility, status, prompt_blob_sha256
         FROM modelapse.test_cases
        WHERE test_version_id = $1
          AND slug = $2`,
      [version.id, OPENAI_SMOKE_CASE_SLUG],
    )
  ).rows[0];

  if (!testCase) {
    if (version.status !== "draft") {
      throw new Error(
        "Published Smoke Test Version is missing its immutable Test Case",
      );
    }
    const inserted = await client.query<{
      id: string;
      case_type: string;
      visibility: string;
      status: string;
      prompt_blob_sha256: string;
    }>(
      `INSERT INTO modelapse.test_cases
        (
          test_version_id,
          slug,
          case_type,
          visibility,
          status,
          prompt_blob_sha256,
          metadata
        )
       VALUES ($1, $2, 'icon', 'public', 'active', $3, $4::jsonb)
       RETURNING id, case_type, visibility, status, prompt_blob_sha256`,
      [
        version.id,
        OPENAI_SMOKE_CASE_SLUG,
        prompt.sha256,
        JSON.stringify({
          expected: "modelapse",
          assertion: "exact-text",
        }),
      ],
    );
    testCase = inserted.rows[0];
  }

  if (!testCase) throw new Error("Smoke Test Case could not be resolved");
  if (
    testCase.case_type !== "icon" ||
    testCase.visibility !== "public" ||
    testCase.status !== "active" ||
    testCase.prompt_blob_sha256 !== prompt.sha256
  ) {
    throw new Error("Smoke Test Case conflicts with existing catalog data");
  }

  if (version.status === "draft") {
    await client.query(
      `UPDATE modelapse.test_versions
          SET status = 'published',
              published_at = now()
        WHERE id = $1
          AND status = 'draft'`,
      [version.id],
    );
  }

  return { versionId: version.id, caseId: testCase.id };
}

export class PgCatalogAdmin {
  constructor(
    private readonly pool: Pool,
    private readonly blobStore: BlobStore,
  ) {}

  static connect(
    connectionString: string,
    blobStore: BlobStore,
  ): PgCatalogAdmin {
    return new PgCatalogAdmin(
      new Pool({ connectionString, max: 2 }),
      blobStore,
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async bootstrapOpenAISmoke(input: {
    readonly runnerBuild: string;
  }): Promise<OpenAISmokeBootstrapResult> {
    if (!input.runnerBuild.trim()) {
      throw new Error("runnerBuild is required");
    }

    const prompt = await this.blobStore.put({
      bytes: OPENAI_SMOKE_PROMPT,
      mimeType: "text/plain; charset=utf-8",
      visibility: "public",
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('modelapse:catalog:openai-smoke:v1'))",
      );

      await registerBlob(client, prompt);

      const providerSourceId = await ensureSource(client, {
        sourceType: "provider_docs",
        url: "https://platform.openai.com/docs/api-reference/responses",
        title: "OpenAI Responses API reference",
      });

      const definitionSourceId = await ensureSource(client, {
        sourceType: "modelapse_definition",
        url: "https://github.com/imwarn/modelapse/blob/main/packages/catalog-admin/src/openai-smoke.ts",
        title: "Modelapse OpenAI direct smoke TestPack",
      });

      const providerId = await ensureProvider(client);
      const endpointId = await ensureEndpoint(
        client,
        providerId,
        providerSourceId,
      );
      const testFamilyId = await ensureTestFamily(
        client,
        definitionSourceId,
      );
      const testVariantId = await ensureVariant(client, testFamilyId);
      const { versionId, caseId } = await ensureVersionAndCase(
        client,
        testVariantId,
        prompt,
      );

      await client.query("COMMIT");

      return {
        providerSourceId,
        definitionSourceId,
        providerId,
        endpointId,
        testFamilyId,
        testVariantId,
        testVersionId: versionId,
        testCaseId: caseId,
        promptSha256: prompt.sha256,
        definitionSha256: rawDefinitionSha256(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const openAISmokeDefinition = OPENAI_SMOKE_PACK;
