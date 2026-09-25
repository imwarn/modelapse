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
  let modelId = "";
  let relatedModelId = "";
  let snapshotId = "";
  let driftSnapshotId = "";
  let sourceId = "";
  let driftSourceId = "";
  let previousTestCaseId = "";

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "modelapse-integration-"));
    const suffix = randomUUID().slice(0, 8);
    const definitionHash = randomBytes(32).toString("hex");
    const previousDefinitionHash = randomBytes(32).toString("hex");
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

    const source = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.source_records
        (source_type, url, title, published_at, retrieved_at, content_sha256)
       VALUES (
         'provider_docs',
         $1,
         'Integration provider identity source',
         '2026-08-31T00:00:00.000Z',
         '2026-09-01T00:00:00.000Z',
         $2
       )
       RETURNING id`,
      [
        `https://router.fake.test/docs/${suffix}`,
        randomBytes(32).toString("hex"),
      ],
    );
    sourceId = source.rows[0]!.id;

    const modelFamily = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.model_families
        (provider_id, slug, display_name)
       VALUES ($1, $2, 'Integration Models')
       RETURNING id`,
      [providerId, `integration-models-${suffix}`],
    );

    const modelTrack = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.model_tracks
        (family_id, slug, display_name, track_type)
       VALUES ($1, 'main', 'Main', 'integration')
       RETURNING id`,
      [modelFamily.rows[0]!.id],
    );

    const model = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.models
        (
          provider_id,
          family_id,
          track_id,
          canonical_slug,
          marketing_name,
          released_at,
          status,
          canonical_source_id
        )
       VALUES ($1, $2, $3, $4, 'Integration Model', $5, 'active', $6)
       RETURNING id`,
      [
        providerId,
        modelFamily.rows[0]!.id,
        modelTrack.rows[0]!.id,
        `integration-model-${suffix}`,
        "2026-09-01T00:00:00.000Z",
        sourceId,
      ],
    );
    modelId = model.rows[0]!.id;

    const relatedModel = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.models
        (
          provider_id,
          family_id,
          track_id,
          canonical_slug,
          marketing_name,
          released_at,
          status
        )
       VALUES ($1, $2, $3, $4, 'Integration Model Next', $5, 'preview')
       RETURNING id`,
      [
        providerId,
        modelFamily.rows[0]!.id,
        modelTrack.rows[0]!.id,
        `integration-model-next-${suffix}`,
        "2026-09-20T00:00:00.000Z",
      ],
    );
    relatedModelId = relatedModel.rows[0]!.id;

    const snapshot = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.model_snapshots
        (model_id, provider_snapshot_id, valid_from, source_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        modelId,
        `integration-snapshot-${suffix}`,
        "2026-09-01T00:00:00.000Z",
        sourceId,
      ],
    );
    snapshotId = snapshot.rows[0]!.id;

    await seedPool.query(
      `INSERT INTO modelapse.model_relations
        (from_model_id, to_model_id, relation_type, valid_from, source_id, confidence)
       VALUES ($1, $2, 'successor_of', $3, $4, 1.0)`,
      [relatedModelId, modelId, "2026-09-20T00:00:00.000Z", sourceId],
    );

    const endpoint = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.provider_endpoints
        (provider_id, path, base_url, hostname, valid_from, source_id)
       VALUES ($1, 'routed_provider', $2, 'router.fake.test', $3, $4)
       RETURNING id`,
      [
        providerId,
        `https://router.fake.test/${suffix}`,
        "2026-09-01T00:00:00.000Z",
        sourceId,
      ],
    );

    const initialBinding = await seedPool.query<{ id: string }>(
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
      [
        modelId,
        endpoint.rows[0]!.id,
        `integration-api-model-${suffix}`,
        snapshotId,
        "2026-09-01T00:00:00.000Z",
        sourceId,
      ],
    );

    const alias = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.model_aliases
        (provider_id, alias)
       VALUES ($1, $2)
       RETURNING id`,
      [providerId, `integration-api-model-${suffix}`],
    );

    await seedPool.query(
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
       VALUES ($1, $2, $3, $4, 'provider_docs', $5, 1.0, $6::jsonb)`,
      [
        alias.rows[0]!.id,
        modelId,
        snapshotId,
        "2026-09-02T00:00:00.000Z",
        sourceId,
        JSON.stringify({ privateNote: "must-not-leak" }),
      ],
    );

    const driftSource = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.source_records
        (source_type, url, title, retrieved_at, content_sha256)
       VALUES (
         'provider_docs',
         $1,
         'Integration provider identity source refresh',
         '2026-09-10T00:00:00.000Z',
         $2
       )
       RETURNING id`,
      [
        `https://router.fake.test/docs/${suffix}?revision=2`,
        randomBytes(32).toString("hex"),
      ],
    );
    driftSourceId = driftSource.rows[0]!.id;

    const driftSnapshot = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.model_snapshots
        (model_id, provider_snapshot_id, valid_from, source_id)
       VALUES ($1, $2, '2026-09-10T00:00:00.000Z', $3)
       RETURNING id`,
      [modelId, `integration-snapshot-next-${suffix}`, driftSourceId],
    );
    driftSnapshotId = driftSnapshot.rows[0]!.id;

    const driftEndpoint = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.provider_endpoints
        (provider_id, path, base_url, hostname, valid_from, source_id)
       VALUES (
         $1,
         'routed_provider',
         $2,
         'router-next.fake.test',
         '2026-09-10T00:00:00.000Z',
         $3
       )
       RETURNING id`,
      [
        providerId,
        `https://router-next.fake.test/${suffix}`,
        driftSourceId,
      ],
    );

    await seedPool.query(
      `UPDATE modelapse.model_execution_bindings
          SET valid_to = '2026-09-10T00:00:00.000Z'
        WHERE id = $1`,
      [initialBinding.rows[0]!.id],
    );

    await seedPool.query(
      `INSERT INTO modelapse.model_execution_bindings
        (
          model_id,
          endpoint_id,
          api_model_id,
          snapshot_id,
          valid_from,
          source_id
        )
       VALUES ($1, $2, $3, $4, '2026-09-10T00:00:00.000Z', $5)`,
      [
        modelId,
        driftEndpoint.rows[0]!.id,
        `integration-api-model-${suffix}`,
        driftSnapshotId,
        driftSourceId,
      ],
    );

    await seedPool.query(
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
       VALUES ($1, $2, $3, '2026-09-10T00:00:00.000Z', 'provider_docs', $4, 1.0, $5::jsonb)`,
      [
        alias.rows[0]!.id,
        modelId,
        driftSnapshotId,
        driftSourceId,
        JSON.stringify({ privateNote: "must-not-leak-refresh" }),
      ],
    );

    const family = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_families
        (slug, name, origin, canonical_source_id)
       VALUES ($1, $2, 'modelapse', $3)
       RETURNING id`,
      [`integration-${suffix}`, "Integration Test", sourceId],
    );

    const variant = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_variants
        (family_id, slug, name, category, artifact_type)
       VALUES ($1, 'text', 'Text', 'integration', 'text')
       RETURNING id`,
      [family.rows[0]!.id],
    );

    const previousVersion = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_versions
        (
          variant_id,
          version,
          status,
          definition_sha256,
          source_id
        )
       VALUES ($1, '0.9.0', 'draft', $2, $3)
       RETURNING id`,
      [variant.rows[0]!.id, previousDefinitionHash, sourceId],
    );

    const previousCase = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_cases
        (test_version_id, slug, case_type, visibility, prompt_blob_sha256)
       VALUES ($1, 'icon', 'icon', 'public', $2)
       RETURNING id`,
      [previousVersion.rows[0]!.id, promptHash],
    );
    previousTestCaseId = previousCase.rows[0]!.id;

    await seedPool.query(
      `UPDATE modelapse.test_versions
          SET status = 'published',
              published_at = $2
        WHERE id = $1`,
      [previousVersion.rows[0]!.id, "2026-08-15T00:00:00.000Z"],
    );

    const version = await seedPool.query<{ id: string }>(
      `INSERT INTO modelapse.test_versions
        (variant_id, version, status, definition_sha256, source_id)
       VALUES ($1, '1.0.0', 'draft', $2, $3)
       RETURNING id`,
      [variant.rows[0]!.id, definitionHash, sourceId],
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
        modelId,
        snapshotId,
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

    const repeat = await executePersistedProviderRun({
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
        modelId,
        snapshotId,
        providerId,
        runnerBuild: "integration-test-repeat",
      },
      collector: "modelapse-integration-test",
    });

    await seedPool.query(
      `INSERT INTO modelapse.run_relations
        (from_run_id, to_run_id, relation_type)
       VALUES ($1, $2, 'repeat_of')`,
      [repeat.run.id, result.run.id],
    );

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
    expect(archived?.relations).toMatchObject([
      {
        direction: "incoming",
        relationType: "repeat_of",
        relatedRunId: repeat.run.id,
      },
    ]);

    const repeatHistory = await archive.getRunHistory({
      modelId,
      testCaseId,
      limit: 20,
    });
    expect(repeatHistory).not.toBeNull();
    expect(repeatHistory?.runs.map((run) => run.id)).toEqual([
      result.run.id,
      repeat.run.id,
    ]);
    expect(repeatHistory?.relations).toMatchObject([
      {
        fromRunId: repeat.run.id,
        toRunId: result.run.id,
        relationType: "repeat_of",
      },
    ]);

    const archivedModel = await archive.getModel(modelId);
    expect(archivedModel).toMatchObject({
      id: modelId,
      family: { displayName: "Integration Models" },
      track: { displayName: "Main" },
      runCount: 2,
      canonicalSource: { id: sourceId, sourceType: "provider_docs" },
      snapshots: expect.arrayContaining([
        expect.objectContaining({
          id: snapshotId,
          source: expect.objectContaining({ id: sourceId }),
        }),
        expect.objectContaining({
          id: driftSnapshotId,
          source: expect.objectContaining({ id: driftSourceId }),
        }),
      ]),
      aliasResolutions: expect.arrayContaining([
        expect.objectContaining({
          alias: expect.objectContaining({
            value: expect.stringContaining("integration-api-model-"),
          }),
          resolvedSnapshot: expect.objectContaining({ id: driftSnapshotId }),
          source: expect.objectContaining({ id: driftSourceId }),
        }),
      ]),
      executionBindings: expect.arrayContaining([
        expect.objectContaining({
          apiModelId: expect.stringContaining("integration-api-model-"),
          snapshot: expect.objectContaining({ id: driftSnapshotId }),
          source: expect.objectContaining({ id: driftSourceId }),
        }),
      ]),
      identityDrift: expect.arrayContaining([
        expect.objectContaining({
          changeType: "alias_target_changed",
          changedFields: ["snapshot"],
          previous: expect.objectContaining({
            snapshot: expect.objectContaining({ id: snapshotId }),
          }),
          current: expect.objectContaining({
            snapshot: expect.objectContaining({ id: driftSnapshotId }),
          }),
          currentSource: expect.objectContaining({ id: driftSourceId }),
        }),
        expect.objectContaining({
          changeType: "execution_binding_changed",
          changedFields: ["endpoint", "snapshot"],
          previous: expect.objectContaining({
            snapshot: expect.objectContaining({ id: snapshotId }),
          }),
          current: expect.objectContaining({
            snapshot: expect.objectContaining({ id: driftSnapshotId }),
            endpoint: expect.objectContaining({
              hostname: "router-next.fake.test",
            }),
          }),
          currentSource: expect.objectContaining({ id: driftSourceId }),
        }),
      ]),
      testCoverage: [{ testCaseId, runCount: 2 }],
    });
    expect(
      archivedModel?.relations.some(
        (relation) =>
          relation.relatedModel.id === relatedModelId &&
          relation.relationType === "successor_of",
      ),
    ).toBe(true);
    expect(
      archivedModel?.timeline.some(
        (event) => event.kind === "run" && event.runId === result.run.id,
      ),
    ).toBe(true);
    expect(
      archivedModel?.identityTimeline.some(
        (event) =>
          event.kind === "alias_resolution" &&
          event.snapshotId === snapshotId &&
          event.source?.id === sourceId,
      ),
    ).toBe(true);
    expect(
      archivedModel?.identityTimeline.some(
        (event) =>
          event.kind === "binding_started" &&
          event.source?.id === sourceId,
      ),
    ).toBe(true);

    const catalogChanges = await archive.listCatalogChanges({
      modelId,
      limit: 20,
    });
    expect(catalogChanges).toHaveLength(2);
    expect(catalogChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          changeType: "alias_target_changed",
          changedFields: ["snapshot"],
          previousSource: expect.objectContaining({ id: sourceId }),
          currentSource: expect.objectContaining({ id: driftSourceId }),
        }),
        expect.objectContaining({
          changeType: "execution_binding_changed",
          changedFields: ["endpoint", "snapshot"],
          previousSource: expect.objectContaining({ id: sourceId }),
          currentSource: expect.objectContaining({ id: driftSourceId }),
        }),
      ]),
    );
    expect(JSON.stringify(catalogChanges)).not.toContain("must-not-leak");

    const archivedTest = await archive.getTest(testCaseId);
    expect(archivedTest).toMatchObject({
      testCaseId,
      origin: "modelapse",
      runCount: 2,
      canonicalSource: { id: sourceId },
      versionSource: { id: sourceId },
      versionHistory: [
        {
          version: "1.0.0",
          source: { id: sourceId },
          linkedTestCaseId: testCaseId,
        },
        {
          version: "0.9.0",
          source: { id: sourceId },
          linkedTestCaseId: previousTestCaseId,
        },
      ],
      modelCoverage: [{ modelId, runCount: 2 }],
    });
    expect(archivedTest?.recentRuns[0]?.id).toBe(repeat.run.id);

    const comparison = await archive.compareLatest({
      modelIds: [modelId, relatedModelId],
      testCaseId,
    });
    expect(comparison).not.toBeNull();
    expect(comparison?.rows).toHaveLength(2);
    expect(comparison?.rows[0]).toMatchObject({
      model: { id: modelId },
      latestRun: { id: repeat.run.id },
    });
    expect(comparison?.rows[1]).toMatchObject({
      model: { id: relatedModelId },
      latestRun: null,
    });

    await expect(
      repository.markStatus(result.run.id, "executing"),
    ).rejects.toThrow(/sealed run/);
  });
});
