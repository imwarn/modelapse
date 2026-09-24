import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import { PgRunJobQueue } from "@modelapse/control-plane";
import {
  EnvironmentCredentialResolver,
  NodeEvidenceTransport,
} from "@modelapse/evidence-transport";
import { PgEvaluationRepository, PgRunRepository } from "@modelapse/persistence";
import { runDirectOpenAI } from "../src/direct-openai.js";
import { processOneQueuedRunJob } from "../src/queue-worker.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://modelapse:modelapse@127.0.0.1:5432/modelapse";

describe("OpenAI first-party direct control path", () => {
  const seedPool = new Pool({ connectionString: DATABASE_URL });
  const repository = PgRunRepository.connect(DATABASE_URL, { max: 2 });
  const evaluations = PgEvaluationRepository.connect(DATABASE_URL, { max: 2 });
  let root = "";
  let testCaseId = "";

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "modelapse-openai-direct-"));
    const blobStore = new FileSystemContentAddressedBlobStore(root);
    const suffix = randomUUID().slice(0, 8);
    const definitionHash = randomBytes(32).toString("hex");
    const prompt = await blobStore.put({
      bytes: "Return exactly the word modelapse.",
      mimeType: "text/plain",
      visibility: "public",
    });

    await seedPool.query(
      `INSERT INTO modelapse.blobs
        (sha256, size_bytes, mime_type, object_key, visibility)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        prompt.sha256,
        prompt.sizeBytes,
        prompt.mimeType,
        prompt.objectKey,
        prompt.visibility,
      ],
    );

    const source = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.source_records
        (source_type, url, title)
       VALUES ('provider_docs', 'https://platform.openai.com/docs/api-reference/responses', 'OpenAI Responses API')
       RETURNING id`,
    );

    const provider = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.providers (slug, name)
       VALUES ($1, 'OpenAI integration')
       RETURNING id`,
      [`openai-integration-${suffix}`],
    );

    await seedPool.query(
      `INSERT INTO modelapse.provider_endpoints
        (provider_id, path, base_url, hostname, source_id)
       VALUES ($1, 'first_party_direct', 'https://api.openai.com', 'api.openai.com', $2)`,
      [provider.rows[0]!.id, source.rows[0]!.id],
    );

    const family = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_families (slug, name, origin)
       VALUES ($1, 'OpenAI Direct Integration', 'modelapse')
       RETURNING id`,
      [`openai-direct-${suffix}`],
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
      [version.rows[0]!.id, prompt.sha256],
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
    await evaluations.close();
    await repository.close();
    await seedPool.end();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("uses the real OpenAI adapter boundary and persists E4 without credentials", async () => {
    const blobStore = new FileSystemContentAddressedBlobStore(root);
    const { privateKey } = generateKeyPairSync("ed25519");
    const secret = "sk-integration-secret";
    let observedAuthorization = "";

    const transport = new NodeEvidenceTransport({
      fetch: async (input, init) => {
        expect(new URL(input).hostname).toBe("api.openai.com");
        const headers = new Headers(init?.headers);
        observedAuthorization = headers.get("authorization") ?? "";

        return new Response(
          JSON.stringify({
            id: "resp_integration",
            object: "response",
            status: "completed",
            model: "gpt-test-snapshot",
            output_text: "modelapse",
            usage: {
              input_tokens: 8,
              output_tokens: 1,
              total_tokens: 9,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_integration",
              "openai-version": "2026-01-01",
            },
          },
        );
      },
    });

    const providerSlug = await seedPool.query<{ slug: string }>(
      `SELECT p.slug
         FROM modelapse.providers p
         JOIN modelapse.provider_endpoints pe ON pe.provider_id = p.id
        WHERE pe.hostname = 'api.openai.com'
          AND p.name = 'OpenAI integration'
        ORDER BY p.slug DESC
        LIMIT 1`,
    );

    // The production runner is intentionally fixed to providerSlug=openai.
    // Rename only this isolated fixture row so it exercises the exact production gate.
    await seedPool.query(
      `UPDATE modelapse.providers SET slug = 'openai' WHERE slug = $1`,
      [providerSlug.rows[0]!.slug],
    );

    const result = await runDirectOpenAI(
      {
        provider: "openai",
        testCaseId,
        model: "gpt-test",
        config: { maxOutputTokens: 32 },
      },
      {
        repository,
        blobStore,
        transport,
        credentials: new EnvironmentCredentialResolver({
          OPENAI_API_KEY: secret,
        }),
        signer: {
          keyId: "openai-direct-integration-key",
          privateKey,
        },
        runnerBuild: "integration-test-build",
      },
    );

    expect(observedAuthorization).toBe("Bearer " + secret);
    expect(result.run.status).toBe("completed");
    expect(result.run.executionPath).toBe("first_party_direct");
    expect(result.run.returnedModel).toBe("gpt-test-snapshot");
    expect(result.run.evidence[0]).toMatchObject({
      level: "E4",
      executionPath: "first_party_direct",
      collector: "modelapse-runner/openai-direct",
    });

    const requestBytes = await blobStore.get(result.sealed.requestSha256);
    const requestEvidence = requestBytes.toString("utf8");
    expect(requestEvidence).not.toContain(secret);
    expect(requestEvidence).toContain("[REDACTED]");
    expect(requestEvidence).toContain("Return exactly the word modelapse.");
  });

  it("claims a durable job and links the successful E4 Run back to the job", async () => {
    const queue = PgRunJobQueue.connect(DATABASE_URL, { max: 2 });
    const blobStore = new FileSystemContentAddressedBlobStore(root);
    const { privateKey } = generateKeyPairSync("ed25519");

    const transport = new NodeEvidenceTransport({
      fetch: async () =>
        new Response(
          JSON.stringify({
            id: "resp_queue",
            status: "completed",
            model: "gpt-queue-snapshot",
            output_text: "modelapse",
            usage: {
              input_tokens: 8,
              output_tokens: 1,
              total_tokens: 9,
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_queue",
            },
          },
        ),
    });

    try {
      const enqueued = await queue.enqueue({
        payload: {
          provider: "openai",
          testCaseId,
          model: "gpt-queue",
        },
        idempotencyKey: "queue-" + randomUUID(),
      });

      const completed = await processOneQueuedRunJob({
        queue,
        repository,
        evaluations,
        blobStore,
        transport,
        credentials: new EnvironmentCredentialResolver({
          OPENAI_API_KEY: "sk-queue-secret",
        }),
        signer: {
          keyId: "queue-integration-key",
          privateKey,
        },
        runnerBuild: "queue-integration-build",
        workerId: "integration-worker",
        leaseSeconds: 180,
      });

      expect(completed?.id).toBe(enqueued.id);
      expect(completed?.status).toBe("succeeded");
      expect(completed?.runId).toBeTruthy();

      const run = await repository.getRun(completed!.runId!);
      expect(run?.status).toBe("completed");
      expect(run?.executionPath).toBe("first_party_direct");
      expect(run?.evidence[0]).toMatchObject({
        level: "E4",
        executionPath: "first_party_direct",
      });
    } finally {
      await queue.close();
    }
  });

  it("links a transport-failed queue job to its failed Run", async () => {
    const queue = PgRunJobQueue.connect(DATABASE_URL, { max: 2 });
    const blobStore = new FileSystemContentAddressedBlobStore(root);
    const { privateKey } = generateKeyPairSync("ed25519");

    try {
      const enqueued = await queue.enqueue({
        payload: {
          provider: "openai",
          testCaseId,
          model: "gpt-transport-failure",
        },
        idempotencyKey: "failure-" + randomUUID(),
      });

      const failed = await processOneQueuedRunJob({
        queue,
        repository,
        evaluations,
        blobStore,
        transport: new NodeEvidenceTransport({
          fetch: async () => {
            throw new Error("synthetic transport failure");
          },
        }),
        credentials: new EnvironmentCredentialResolver({
          OPENAI_API_KEY: "sk-failure-secret",
        }),
        signer: {
          keyId: "queue-failure-key",
          privateKey,
        },
        runnerBuild: "queue-failure-build",
        workerId: "failure-worker",
        leaseSeconds: 180,
      });

      expect(failed?.id).toBe(enqueued.id);
      expect(failed?.status).toBe("failed");
      expect(failed?.runId).toBeTruthy();

      const run = await repository.getRun(failed!.runId!);
      expect(run?.status).toBe("failed_request");
      expect(run?.sealedAt).toBeNull();
    } finally {
      await queue.close();
    }
  });
});
