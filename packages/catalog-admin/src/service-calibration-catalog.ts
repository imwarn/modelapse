import type { BlobDescriptor, BlobStore } from "@modelapse/blob-store";
import { Pool, type PoolClient } from "pg";
import {
  SERVICE_CALIBRATION_CASE_SLUG,
  SERVICE_CALIBRATION_EXPECTED,
  SERVICE_CALIBRATION_FAMILY,
  SERVICE_CALIBRATION_PACK,
  SERVICE_CALIBRATION_PROMPT,
  SERVICE_CALIBRATION_VARIANT,
  SERVICE_CALIBRATION_VERSION,
  serviceCalibrationDefinitionSha256,
} from "./service-calibration.js";

export interface ServiceCalibrationBootstrapResult {
  readonly definitionSourceId: string;
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
}

async function ensureSource(client: PoolClient): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id
       FROM modelapse.source_records
      WHERE source_type = 'modelapse_definition'
        AND url = $1
      ORDER BY retrieved_at DESC
      LIMIT 1`,
    [
      "https://github.com/imwarn/modelapse/blob/main/packages/catalog-admin/src/service-calibration.ts",
    ],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO modelapse.source_records
      (source_type, url, title)
     VALUES ('modelapse_definition', $1, $2)
     RETURNING id`,
    [
      "https://github.com/imwarn/modelapse/blob/main/packages/catalog-admin/src/service-calibration.ts",
      "Modelapse service-health calibration TestPack",
    ],
  );
  return inserted.rows[0]!.id;
}

async function evaluatorId(client: PoolClient): Promise<string> {
  const result = await client.query<{
    id: string;
    kind: string;
    definition_sha256: string;
  }>(
    `SELECT id, kind, definition_sha256
       FROM modelapse.evaluators
      WHERE slug = 'exact-text'
        AND version = '1.0.0'
      LIMIT 1`,
  );
  const row = result.rows[0];
  if (
    !row ||
    row.kind !== "deterministic" ||
    row.definition_sha256 !==
      "513621b96e389527409b735499aaa3f5c2d0d6bd438ffc752d3060fba066c7b5"
  ) {
    throw new Error("exact-text evaluator v1.0.0 is unavailable or incompatible");
  }
  return row.id;
}

export class PgServiceCalibrationCatalog {
  constructor(
    private readonly pool: Pool,
    private readonly blobStore: BlobStore,
  ) {}

  static connect(
    connectionString: string,
    blobStore: BlobStore,
  ): PgServiceCalibrationCatalog {
    return new PgServiceCalibrationCatalog(
      new Pool({ connectionString, max: 2 }),
      blobStore,
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async bootstrap(input: {
    readonly runnerBuild: string;
  }): Promise<ServiceCalibrationBootstrapResult> {
    if (!input.runnerBuild.trim()) throw new Error("runnerBuild is required");

    const prompt = await this.blobStore.put({
      bytes: SERVICE_CALIBRATION_PROMPT,
      mimeType: "text/plain; charset=utf-8",
      visibility: "public",
    });

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('modelapse:service-calibration:v1'))",
      );
      await registerBlob(client, prompt);
      const sourceId = await ensureSource(client);
      const evaluator = await evaluatorId(client);

      await client.query(
        `INSERT INTO modelapse.test_families
          (slug, name, origin, canonical_source_id, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (slug) DO NOTHING`,
        [
          SERVICE_CALIBRATION_FAMILY.slug,
          SERVICE_CALIBRATION_FAMILY.name,
          SERVICE_CALIBRATION_FAMILY.origin,
          sourceId,
          JSON.stringify({
            purpose: "service-health-calibration",
            leaderboardEligible: false,
          }),
        ],
      );

      const family = await client.query<{ id: string }>(
        `SELECT id
           FROM modelapse.test_families
          WHERE slug = $1
          LIMIT 1`,
        [SERVICE_CALIBRATION_FAMILY.slug],
      );
      const familyId = family.rows[0]?.id;
      if (!familyId) throw new Error("Calibration Test Family could not be resolved");

      await client.query(
        `INSERT INTO modelapse.test_variants
          (family_id, slug, name, category, artifact_type)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (family_id, slug) DO NOTHING`,
        [
          familyId,
          SERVICE_CALIBRATION_VARIANT.slug,
          SERVICE_CALIBRATION_VARIANT.name,
          SERVICE_CALIBRATION_VARIANT.category,
          SERVICE_CALIBRATION_VARIANT.artifactType,
        ],
      );
      const variant = await client.query<{ id: string }>(
        `SELECT id
           FROM modelapse.test_variants
          WHERE family_id = $1
            AND slug = $2
          LIMIT 1`,
        [familyId, SERVICE_CALIBRATION_VARIANT.slug],
      );
      const variantId = variant.rows[0]?.id;
      if (!variantId) throw new Error("Calibration Test Variant could not be resolved");

      let version = (
        await client.query<{
          id: string;
          status: "draft" | "published" | "retired";
          definition_sha256: string;
        }>(
          `SELECT id, status, definition_sha256
             FROM modelapse.test_versions
            WHERE variant_id = $1
              AND version = $2
            LIMIT 1`,
          [variantId, SERVICE_CALIBRATION_VERSION],
        )
      ).rows[0];

      if (!version) {
        version = (
          await client.query<{
            id: string;
            status: "draft";
            definition_sha256: string;
          }>(
            `INSERT INTO modelapse.test_versions
              (
                variant_id,
                version,
                status,
                definition_sha256,
                source_id
              )
             VALUES ($1, $2, 'draft', $3, $4)
             RETURNING id, status, definition_sha256`,
            [
              variantId,
              SERVICE_CALIBRATION_VERSION,
              serviceCalibrationDefinitionSha256(),
              sourceId,
            ],
          )
        ).rows[0];
      }

      if (!version) throw new Error("Calibration Test Version could not be resolved");
      if (version.definition_sha256 !== serviceCalibrationDefinitionSha256()) {
        throw new Error("Calibration Test Version immutable definition conflict");
      }
      if (version.status === "retired") {
        throw new Error("Calibration Test Version is retired");
      }

      let testCase = (
        await client.query<{ id: string; case_type: string; prompt_blob_sha256: string }>(
          `SELECT id, case_type, prompt_blob_sha256
             FROM modelapse.test_cases
            WHERE test_version_id = $1
              AND slug = $2
            LIMIT 1`,
          [version.id, SERVICE_CALIBRATION_CASE_SLUG],
        )
      ).rows[0];

      if (!testCase) {
        if (version.status !== "draft") {
          throw new Error("Published Calibration Test Version is missing its immutable case");
        }
        testCase = (
          await client.query<{
            id: string;
            case_type: string;
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
             VALUES (
               $1,
               $2,
               'calibration',
               'public',
               'active',
               $3,
               $4::jsonb
             )
             RETURNING id, case_type, prompt_blob_sha256`,
            [
              version.id,
              SERVICE_CALIBRATION_CASE_SLUG,
              prompt.sha256,
              JSON.stringify({
                expected: SERVICE_CALIBRATION_EXPECTED,
                assertion: "exact-text",
                leaderboardEligible: false,
              }),
            ],
          )
        ).rows[0];
      }

      if (
        !testCase ||
        testCase.case_type !== "calibration" ||
        testCase.prompt_blob_sha256 !== prompt.sha256
      ) {
        throw new Error("Calibration Test Case conflicts with existing catalog data");
      }

      await client.query(
        `INSERT INTO modelapse.test_version_evaluators
          (test_version_id, evaluator_id)
         VALUES ($1, $2)
         ON CONFLICT (test_version_id) DO NOTHING`,
        [version.id, evaluator],
      );

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

      await client.query("COMMIT");
      return {
        definitionSourceId: sourceId,
        testFamilyId: familyId,
        testVariantId: variantId,
        testVersionId: version.id,
        testCaseId: testCase.id,
        promptSha256: prompt.sha256,
        definitionSha256: serviceCalibrationDefinitionSha256(),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const serviceCalibrationDefinition = SERVICE_CALIBRATION_PACK;
