import { canonicalJson, sha256Utf8 } from "@modelapse/attestation";
import { FileSystemContentAddressedBlobStore } from "@modelapse/blob-store";
import type { SealedProviderRun } from "@modelapse/runner";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  persistSealedProviderRun,
  type RunView,
  type SealRunInput,
} from "../src/index.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("persistSealedProviderRun", () => {
  it("stores exact captured bytes and records E4 for a direct sealed run", async () => {
    const root = await mkdtemp(join(tmpdir(), "modelapse-persistence-"));
    roots.push(root);
    const blobStore = new FileSystemContentAddressedBlobStore(root);

    const exchange = {
      url: "https://api.fake.test/v1/responses",
      method: "POST",
      status: 200,
      requestHeaders: { "content-type": "application/json" },
      responseHeaders: {
        "content-type": "application/json; charset=utf-8",
        "request-id": "req_1",
      },
      requestBody: "{\"model\":\"fake\"}",
      responseBody: "{\"id\":\"resp_1\"}",
      startedAt: "2026-09-23T00:00:00.000Z",
      completedAt: "2026-09-23T00:00:01.250Z",
    };

    const requestSha256 = sha256Utf8(
      canonicalJson({
        url: exchange.url,
        method: exchange.method,
        headers: exchange.requestHeaders,
        body: exchange.requestBody,
      }),
    );
    const responseSha256 = sha256Utf8(exchange.responseBody);

    const sealed: SealedProviderRun = {
      runId: "00000000-0000-4000-8000-000000000001",
      provider: "fake",
      executionPath: "first_party_direct",
      status: "completed",
      exchange,
      normalized: {
        requestedModel: "fake",
        returnedModel: "fake-2026-09-23",
        providerRequestId: "req_1",
        providerResponseId: "resp_1",
        content: [{ type: "text", text: "ok" }],
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      },
      requestSha256,
      responseSha256,
      sealedAt: "2026-09-23T00:00:01.500Z",
      attestation: {
        algorithm: "Ed25519",
        keyId: "runner-test",
        signatureBase64: "signature",
        payload: {
          schemaVersion: "1",
          runId: "00000000-0000-4000-8000-000000000001",
          runnerBuild: "test",
          provider: "fake",
          executionPath: "first_party_direct",
          requestedModel: "fake",
          returnedModel: "fake-2026-09-23",
          requestId: "req_1",
          responseId: "resp_1",
          httpStatus: 200,
          requestSha256,
          responseSha256,
          startedAt: exchange.startedAt,
          completedAt: exchange.completedAt,
          sealedAt: "2026-09-23T00:00:01.500Z",
        },
      },
    };

    let captured: SealRunInput | undefined;
    const expectedView = { id: sealed.runId } as RunView;

    const result = await persistSealedProviderRun({
      blobStore,
      repository: {
        sealRun: async (value) => {
          captured = value;
          return expectedView;
        },
      },
      sealed,
      attestationKey: {
        publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      },
      collector: "modelapse-runner",
    });

    expect(result).toBe(expectedView);
    expect(captured?.requestBlob.sha256).toBe(requestSha256);
    expect(captured?.responseBlob.sha256).toBe(responseSha256);
    expect(captured?.responseBlob.mimeType).toBe("application/json");
    expect(captured?.evidence.level).toBe("E4");
    expect(captured?.evidence.executionPath).toBe("first_party_direct");
    expect(captured?.providerMetadata?.timing).toMatchObject({ durationMs: 1250 });
  });
});
