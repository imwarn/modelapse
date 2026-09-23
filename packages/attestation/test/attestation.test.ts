import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  signRunAttestation,
  verifyRunAttestation,
  type RunAttestationPayload,
} from "../src/index.js";

describe("run attestation", () => {
  it("signs and verifies a canonical payload", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const payload: RunAttestationPayload = {
      schemaVersion: "1",
      runId: "run_test",
      runnerBuild: "test",
      provider: "openai",
      executionPath: "first_party_direct",
      requestedModel: "model",
      httpStatus: 200,
      requestSha256: "a".repeat(64),
      responseSha256: "b".repeat(64),
      startedAt: "2026-09-23T00:00:00.000Z",
      completedAt: "2026-09-23T00:00:01.000Z",
      sealedAt: "2026-09-23T00:00:02.000Z",
    };

    const signed = signRunAttestation({
      keyId: "test-key",
      privateKey,
      payload,
    });

    expect(verifyRunAttestation(signed, publicKey)).toBe(true);
    expect(
      verifyRunAttestation(
        {
          ...signed,
          payload: { ...signed.payload, requestedModel: "tampered" },
        },
        publicKey,
      ),
    ).toBe(false);
  });
});
