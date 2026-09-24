import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import type {
  EvidenceTransport,
  ProviderAdapter,
} from "@modelapse/provider-adapter";
import {
  executePersistedProviderRun,
  PgArchiveRepository,
  PgRunRepository,
} from "../src/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

describe("PostgreSQL Run persistence", () => {
  const seedPool = new Pool({ connectionString: DATABASE_URL });
  const repository = PgRunRepository.connect(DATABASE_URL, { max: 2 });
  const archive = PgArchiveRepository.connect(DATABASE_URL, { max: 2 });
  let root = "";
  let providerId = "";
  let testCaseId = "";

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "modelapse-integration-"));
    const suffix = randomUUID().slice(0, 8);
    const definitionHash = randomBytes(32).toString("hex");
    const promptHash = randomBytes(32).toString("hex");

    await seedPool.query(
      `INSERT INTO modelapse.blobs
        (sha256, size_bytes, mime_type, object_key, visibility)
       VALUES ($1, 1, 'text/plain', $2, 'private')`,
      [promptHash, `sha256/${promptHash.slice(0, 2)}/${promptHash.slice(2, 4)}/${promptHash}`],
    );

    const provider = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.providers (slug, name)
       VALUES ($1, $2)
       RETURNING id`,
      [`integration-router-${suffix}`, "Integration Router"],
    );
    providerId = provider.rows[0]!.id;

    const family = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_families (slug, name, origin)
       VALUES ($1, $2, 'modelapse')
       RETURNING id`,
      [`integration-${suffix}`, "Integration Test"],
    );

    const variant = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_variants
        (family_id, slug, name, category, artifact_type)
       VALUES ($1, 'text', 'Text', 'integration', 'text')
       RETURNING id`,
      [family.rows[0]!.id],
    );

    const version = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_versions
        (variant_id, version, status, definition_sha256)
       VALUES ($1, '1.0.0', 'draft', $2)
       RETURNING id`,
      [variant.rows[0]!.id, definitionHash],
    );

    const testCase = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_cases
        (test_version_id, slug, case_type, visibility, prompt_blob_sha256)
       VALUES ($1, 'icon', 'icon', 'public', $2)
       RETURNING id`,
      [version.rows[0]!.id, promptHash],
    );
    testCaseId = testCase.rows[0]!.id;

    await seedPool.query(
      `UPDATE modelapse.test_versions
          SET status = 'published', published_at = now()
        WHERE id = $1`,
      [version.rows[0]!.id],
    );
  });

  afterAll(async () => {
    await archive.close();
    await repository.close();
    await seedPool.end();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("persists, attests and seals a routed provider response", async () => {
    const blobStore = new FileSystemContentAddressedBlobStore(root);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");

    const adapter: ProviderAdapter = {
      descriptor: {
        id: "integration-router",
        providerSlug: "integration-router",
        executionPath: "routed_provider",
        allowedHosts: ["router.fake.test"],
      },
      prepare: (request) => ({
        url: "https://router.fake.test/v1/messages",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: request.model, prompt: "hello" }),
        capture: { responseHeaderAllowlist: ["request-id"] },
      }),
      parse: (capture, request) => ({
        requestedModel: request.model,
        returnedModel: "fake-snapshot-1",
        ...(capture.responseHeaders["request-id"]
          ? { providerRequestId: capture.responseHeaders["request-id"] }
          : {}),
        providerResponseId: "response_1",
        upstreamId: "upstream_1",
        routedProviderName: "Fake Upstream",
        content: [{ type: "text", text: "hello" }],
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          providerRaw: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    };

    const transport: EvidenceTransport = {
      execute: async ({ request }) => ({
        url: request.url,
        method: request.method,
        status: 200,
        requestHeaders: request.headers,
        responseHeaders: { "request-id": "request_1" },
        requestBody: request.body ?? "",
        responseBody: JSON.stringify({
          id: "response_1",
          model: "fake-snapshot-1",
          output: "hello",
        }),
        startedAt: "2026-09-23T12:00:00.000Z",
        completedAt: "2026-09-23T12:00:00.250Z",
      }),
    };

    const result = await executePersistedProviderRun({
      repository,
      blobStore,
      adapter,
      transport,
      credentials: { resolve: async () => "unused" },
      signer: { keyId: "integration-key", privateKey },
      attestationPublicKeyPem: publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
      request: {
        model: "fake-model",
        messages: [
          { role: "user", content: [{ type: "text", text: "hello" }] },
        ],
      },
      run: {
        testCaseId,
        providerId,
        runnerBuild: "integration-test",
      },
      collector: "modelapse-integration-test",
    });

    expect(result.sealed.status).toBe("completed");
    expect(result.sealed.executionPath).toBe("routed_provider");
    expect(result.run.sealedAt).not.toBeNull();
    expect(result.run.status).toBe("completed");
    expect(result.run.returnedModel).toBe("fake-snapshot-1");
    expect(result.run.requestBlob?.sha256).toBe(result.sealed.requestSha256);
    expect(result.run.responseBlob?.sha256).toBe(result.sealed.responseSha256);
    expect(result.run.evidence[0]).toMatchObject({
      level: "E3",
      executionPath: "routed_provider",
      collector: "modelapse-integration-test",
    });
    expect(result.run.providerMetadata).toMatchObject({
      providerRequestId: "request_1",
      providerResponseId: "response_1",
      upstreamId: "upstream_1",
      routedProviderName: "Fake Upstream",
    });

    const archived = await archive.getRun(result.run.id);
    expect(archived).not.toBeNull();
    expect(archived?.requestBlob).toMatchObject({
      sha256: result.sealed.requestSha256,
      visibility: "private",
    });
    expect(archived?.responseBlob).toMatchObject({
      sha256: result.sealed.responseSha256,
      visibility: "private",
    });
    expect(archived?.timing).toMatchObject({ durationMs: 250 });
    expect(archived?.usage).toMatchObject({
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
    });
    expect(archived?.evidence[0]).toMatchObject({
      level: "E3",
      executionPath: "routed_provider",
      collector: "modelapse-integration-test",
      attestation: {
        keyId: "integration-key",
        algorithm: "Ed25519",
      },
    });

    await expect(
      repository.markStatus(result.run.id, "executing"),
    ).rejects.toThrow(/sealed run/);
  });
});
