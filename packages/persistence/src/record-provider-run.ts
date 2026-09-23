import { canonicalJson } from "@modelapse/attestation";
import type { BlobStore } from "@modelapse/blob-store";
import {
  executionPaths,
  isEvidenceCompatible,
  type EvidenceLevel,
  type ExecutionPath,
} from "@modelapse/domain";
import type { SealedProviderRun } from "@modelapse/runner";
import type { RunRepository, RunView } from "./types.js";

function executionPath(value: string): ExecutionPath {
  if ((executionPaths as readonly string[]).includes(value)) {
    return value as ExecutionPath;
  }
  throw new Error("Unknown execution path in attestation: " + value);
}

function responseMimeType(headers: Readonly<Record<string, string>>): string {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "content-type") {
      return value.split(";", 1)[0]?.trim() || "application/octet-stream";
    }
  }
  return "application/octet-stream";
}

function timing(
  startedAt: string,
  completedAt: string,
): Readonly<Record<string, unknown>> {
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  return {
    startedAt,
    completedAt,
    ...(Number.isFinite(started) && Number.isFinite(completed)
      ? { durationMs: Math.max(0, completed - started) }
      : {}),
  };
}

export interface PersistSealedProviderRunInput {
  readonly repository: Pick<RunRepository, "sealRun">;
  readonly blobStore: BlobStore;
  readonly sealed: SealedProviderRun;
  readonly attestationKey: {
    readonly publicKeyPem: string;
    readonly validFrom?: string;
  };
  readonly collector: string;
  readonly evidenceLevel?: EvidenceLevel;
  readonly evidenceNotes?: string;
}

export async function persistSealedProviderRun(
  input: PersistSealedProviderRunInput,
): Promise<RunView> {
  const path = executionPath(input.sealed.attestation.payload.executionPath);
  const level =
    input.evidenceLevel ?? (path === "first_party_direct" ? "E4" : "E2");

  if (!isEvidenceCompatible(path, level)) {
    throw new Error("Evidence level " + level + " is incompatible with " + path);
  }

  const requestBytes = canonicalJson({
    url: input.sealed.exchange.url,
    method: input.sealed.exchange.method,
    headers: input.sealed.exchange.requestHeaders,
    body: input.sealed.exchange.requestBody,
  });

  const requestBlob = await input.blobStore.put({
    bytes: requestBytes,
    mimeType: "application/json",
    visibility: "private",
  });
  if (requestBlob.sha256 !== input.sealed.requestSha256) {
    throw new Error("Captured request hash does not match sealed attestation");
  }

  const responseBlob = await input.blobStore.put({
    bytes: input.sealed.exchange.responseBody,
    mimeType: responseMimeType(input.sealed.exchange.responseHeaders),
    visibility: "private",
  });
  if (responseBlob.sha256 !== input.sealed.responseSha256) {
    throw new Error("Captured response hash does not match sealed attestation");
  }

  const responseHeadersBlob = await input.blobStore.put({
    bytes: canonicalJson(input.sealed.exchange.responseHeaders),
    mimeType: "application/json",
    visibility: "private",
  });

  const attestationPayloadBlob = await input.blobStore.put({
    bytes: canonicalJson(input.sealed.attestation.payload),
    mimeType: "application/json",
    visibility: "public",
  });

  const normalized = input.sealed.normalized;
  const providerMetadata = {
    ...(normalized?.providerRequestId
      ? { providerRequestId: normalized.providerRequestId }
      : {}),
    ...(normalized?.providerResponseId
      ? { providerResponseId: normalized.providerResponseId }
      : {}),
    ...(normalized?.modelVersion ? { modelVersion: normalized.modelVersion } : {}),
    ...(normalized?.upstreamId ? { upstreamId: normalized.upstreamId } : {}),
    ...(normalized?.routedProviderName
      ? { routedProviderName: normalized.routedProviderName }
      : {}),
    ...(normalized?.usage ? { usage: normalized.usage } : {}),
    timing: timing(
      input.sealed.exchange.startedAt,
      input.sealed.exchange.completedAt,
    ),
    ...(normalized?.providerMetadata
      ? { metadata: normalized.providerMetadata }
      : {}),
  };

  return input.repository.sealRun({
    runId: input.sealed.runId,
    status: input.sealed.status,
    ...(normalized?.returnedModel
      ? { returnedModel: normalized.returnedModel }
      : {}),
    startedAt: input.sealed.exchange.startedAt,
    completedAt: input.sealed.exchange.completedAt,
    sealedAt: input.sealed.sealedAt,
    requestBlob,
    responseBlob,
    responseHeadersBlob,
    attestationPayloadBlob,
    providerMetadata,
    attestation: {
      keyId: input.sealed.attestation.keyId,
      algorithm: input.sealed.attestation.algorithm,
      publicKeyPem: input.attestationKey.publicKeyPem,
      validFrom:
        input.attestationKey.validFrom ?? input.sealed.exchange.startedAt,
      signatureBase64: input.sealed.attestation.signatureBase64,
    },
    evidence: {
      level,
      executionPath: path,
      collector: input.collector,
      ...(input.evidenceNotes ? { notes: input.evidenceNotes } : {}),
    },
  });
}
