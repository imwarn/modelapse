import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  EvidenceTransport,
  ProviderAdapter,
} from "@modelapse/provider-adapter";
import {
  executeProviderRun,
  type ProviderRunPlan,
} from "../src/index.js";
import { verifyRunAttestation } from "@modelapse/attestation";

const adapter: ProviderAdapter = {
  descriptor: {
    id: "fake-direct",
    providerSlug: "fake",
    executionPath: "first_party_direct",
    allowedHosts: ["api.fake.test"],
  },
  prepare: () => ({
    url: "https://api.fake.test/v1/messages",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"model":"fake"}',
    capture: { responseHeaderAllowlist: ["request-id"] },
  }),
  parse: (capture, request) => ({
    requestedModel: request.model,
    returnedModel: "fake-snapshot",
    ...(capture.responseHeaders["request-id"]
      ? { providerRequestId: capture.responseHeaders["request-id"] }
      : {}),
    providerResponseId: "resp_1",
    content: [{ type: "text", text: "hello" }],
  }),
};

const transport: EvidenceTransport = {
  execute: async () => ({
    url: "https://api.fake.test/v1/messages",
    method: "POST",
    status: 200,
    requestHeaders: { "content-type": "application/json" },
    responseHeaders: { "request-id": "req_1" },
    requestBody: '{"model":"fake"}',
    responseBody: '{"ok":true}',
    startedAt: "2026-09-23T00:00:00.000Z",
    completedAt: "2026-09-23T00:00:01.000Z",
  }),
};

describe("executeProviderRun", () => {
  it("produces a signed sealed execution record", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const transitions: string[] = [];
    const plan: ProviderRunPlan = {
      runId: "run_1",
      runnerBuild: "test-build",
      adapter,
      transport,
      credentials: { resolve: async () => "unused" },
      signer: { keyId: "test", privateKey },
      request: {
        model: "fake",
        messages: [
          { role: "user", content: [{ type: "text", text: "hello" }] },
        ],
      },
      onTransition: (from, to) => {
        transitions.push(`${from}->${to}`);
      },
    };

    const result = await executeProviderRun(plan);
    expect(result.status).toBe("completed");
    expect(transitions).toEqual([
      "planned->executing",
      "executing->response_captured",
      "response_captured->completed",
    ]);
    expect(verifyRunAttestation(result.attestation, publicKey)).toBe(true);
    expect(result.attestation.payload.requestId).toBe("req_1");
  });
});
