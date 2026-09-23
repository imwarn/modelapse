import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

export interface RunAttestationPayload {
  readonly schemaVersion: "1";
  readonly runId: string;
  readonly runnerBuild: string;
  readonly provider: string;
  readonly executionPath: string;
  readonly requestedModel: string;
  readonly returnedModel?: string;
  readonly requestId?: string;
  readonly responseId?: string;
  readonly httpStatus: number;
  readonly requestSha256: string;
  readonly responseSha256: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly sealedAt: string;
}

export interface SignedRunAttestation {
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  readonly payload: RunAttestationPayload;
  readonly signatureBase64: string;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function privateKey(input: string | KeyObject): KeyObject {
  return typeof input === "string" ? createPrivateKey(input) : input;
}

function publicKey(input: string | KeyObject): KeyObject {
  return typeof input === "string" ? createPublicKey(input) : input;
}

export function signRunAttestation(input: {
  readonly keyId: string;
  readonly privateKey: string | KeyObject;
  readonly payload: RunAttestationPayload;
}): SignedRunAttestation {
  const bytes = Buffer.from(canonicalJson(input.payload), "utf8");
  const signature = sign(null, bytes, privateKey(input.privateKey));

  return {
    algorithm: "Ed25519",
    keyId: input.keyId,
    payload: input.payload,
    signatureBase64: signature.toString("base64"),
  };
}

export function verifyRunAttestation(
  attestation: SignedRunAttestation,
  key: string | KeyObject,
): boolean {
  return verify(
    null,
    Buffer.from(canonicalJson(attestation.payload), "utf8"),
    publicKey(key),
    Buffer.from(attestation.signatureBase64, "base64"),
  );
}
