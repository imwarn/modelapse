import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import { migrateDatabase } from "@modelapse/database";
import { PgRunRepository } from "@modelapse/persistence";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgCatalogAdmin } from "../src/index.js";

const ADMIN_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

function databaseUrl(databaseName: string): string {
  const url = new URL(ADMIN_DATABASE_URL);
  url.pathname = "/" + databaseName;
  return url.toString();
}

describe("production catalog bootstrap", () => {
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL });
  const databaseName =
    "modelapse_catalog_" + randomUUID().replace(/-/g, "").slice(0, 12);
  const isolatedDatabaseUrl = databaseUrl(databaseName);
  let root = "";
  let catalog: PgCatalogAdmin | undefined;
  let runs: PgRunRepository | undefined;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);

    await migrateDatabase({
      connectionString: isolatedDatabaseUrl,
      migrationsDirectory: fileURLToPath(
        new URL("../../database/migrations/", import.meta.url),
      ),
      runnerBuild: "catalog-bootstrap-integration",
    });

    root = await mkdtemp(join(tmpdir(), "modelapse-catalog-bootstrap-"));
    catalog = PgCatalogAdmin.connect(
      isolatedDatabaseUrl,
      new FileSystemContentAddressedBlobStore(root),
    );
    runs = PgRunRepository.connect(isolatedDatabaseUrl, { max: 2 });
  });

  afterAll(async () => {
    await runs?.close();
    await catalog?.close();
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await adminPool.end();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("bootstraps DeepSeek idempotently and resolves its sourced direct target", async () => {
    const first = await catalog!.bootstrapDeepSeekSmoke({
      runnerBuild: "deepseek-build-a",
    });
    const second = await catalog!.bootstrapDeepSeekSmoke({
      runnerBuild: "deepseek-build-b",
    });

    expect(second).toEqual(first);

    const target = await runs!.resolveDirectExecutionTarget({
      testCaseId: first.testCaseId,
      providerSlug: "deepseek",
      endpointHostname: "api.deepseek.com",
    });

    expect(target.providerId).toBe(first.providerId);
    expect(target.endpointBaseUrl).toBe("https://api.deepseek.com");
    expect(target.promptBlob.sha256).toBe(first.promptSha256);
  });

  it("is idempotent and produces an executable sourced direct target", async () => {
    const first = await catalog!.bootstrapOpenAISmoke({
      runnerBuild: "build-a",
    });
    const second = await catalog!.bootstrapOpenAISmoke({
      runnerBuild: "build-b",
    });

    expect(second).toEqual(first);

    const target = await runs!.resolveDirectExecutionTarget({
      testCaseId: first.testCaseId,
      providerSlug: "openai",
      endpointHostname: "api.openai.com",
    });

    expect(target.providerId).toBe(first.providerId);
    expect(target.endpointBaseUrl).toBe("https://api.openai.com");
    expect(target.promptBlob.sha256).toBe(first.promptSha256);

    const verification = new Pool({ connectionString: isolatedDatabaseUrl });
    try {
      const row = await verification.query<{
        version_status: string;
        endpoint_source_id: string | null;
        family_source_id: string | null;
      }>(
        `SELECT
           tv.status AS version_status,
           pe.source_id AS endpoint_source_id,
           tf.canonical_source_id AS family_source_id
         FROM modelapse.test_cases tc
         JOIN modelapse.test_versions tv ON tv.id = tc.test_version_id
         JOIN modelapse.test_variants tvar ON tvar.id = tv.variant_id
         JOIN modelapse.test_families tf ON tf.id = tvar.family_id
         JOIN modelapse.providers p ON p.slug = 'openai'
         JOIN modelapse.provider_endpoints pe
           ON pe.provider_id = p.id
          AND pe.path = 'first_party_direct'
          AND pe.hostname = 'api.openai.com'
        WHERE tc.id = $1`,
        [first.testCaseId],
      );

      expect(row.rows[0]).toMatchObject({
        version_status: "published",
        endpoint_source_id: first.providerSourceId,
        family_source_id: first.definitionSourceId,
      });
    } finally {
      await verification.end();
    }
  });
});
