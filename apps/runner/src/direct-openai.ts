import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import type { BlobStore } from "@modelapse/blob-store";
import type { DirectOpenAIRunRequest } from "@modelapse/control-plane";
import type {
  CredentialResolver,
  EvidenceTransport,
  ProviderAdapter,
} from "@modelapse/provider-adapter";
import { assertPreparedRequestAllowed } from "@modelapse/provider-adapter";
import {
  executePersistedProviderRun,
  type ExecutionCatalogRepository,
  type RunRepository,
} from "@modelapse/persistence";
import { OpenAIResponsesAdapter } from "@modelapse/provider-openai";

export { parseDirectOpenAIRunRequest } from "@modelapse/control-plane";
export type { DirectOpenAIRunRequest } from "@modelapse/control-plane";

export interface DirectOpenAIRunDependencies {
  readonly repository: RunRepository & ExecutionCatalogRepository;
  readonly blobStore: BlobStore;
  readonly transport: EvidenceTransport;
  readonly credentials: CredentialResolver;
  readonly signer: {
    readonly keyId: string;
    readonly privateKey: string | KeyObject;
  };
  readonly runnerBuild: string;
  readonly collector?: string;
  readonly adapter?: ProviderAdapter;
}

function publicKeyPem(privateKey: string | KeyObject): string {
  const key =
    typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  return createPublicKey(key)
    .export({ type: "spki", format: "pem" })
    .toString();
}

function decodeVerifiedPrompt(
  bytes: Buffer,
  expectedSha256: string,
  expectedSizeBytes: number,
  mimeType: string,
): string {
  if (!mimeType.toLowerCase().startsWith("text/")) {
    throw new Error("Direct text runner requires a text/* prompt blob");
  }
  if (bytes.byteLength !== expectedSizeBytes) {
    throw new Error("Prompt blob size does not match PostgreSQL metadata");
  }

  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error("Prompt blob content does not match its SHA-256 address");
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function runDirectOpenAI(
  request: DirectOpenAIRunRequest,
  deps: DirectOpenAIRunDependencies,
) {
  if (!deps.runnerBuild.trim()) {
    throw new Error("runnerBuild is required");
  }
  if (!deps.signer.keyId.trim()) {
    throw new Error("attestation key id is required");
  }

  const adapter = deps.adapter ?? new OpenAIResponsesAdapter();
  if (
    adapter.descriptor.providerSlug !== "openai" ||
    adapter.descriptor.executionPath !== "first_party_direct"
  ) {
    throw new Error("Direct OpenAI runner requires the OpenAI first-party adapter");
  }

  const endpointHostname = adapter.descriptor.allowedHosts[0];
  if (!endpointHostname) {
    throw new Error("OpenAI adapter must declare at least one allowed host");
  }

  const target = await deps.repository.resolveDirectExecutionTarget({
    testCaseId: request.testCaseId,
    providerSlug: adapter.descriptor.providerSlug,
    endpointHostname,
  });

  const catalogEndpoint = new URL(target.endpointBaseUrl);
  if (
    catalogEndpoint.protocol !== "https:" ||
    catalogEndpoint.hostname !== endpointHostname
  ) {
    throw new Error("Catalog endpoint does not match the direct adapter boundary");
  }

  const promptBytes = await deps.blobStore.get(target.promptBlob.sha256);
  const prompt = decodeVerifiedPrompt(
    promptBytes,
    target.promptBlob.sha256,
    target.promptBlob.sizeBytes,
    target.promptBlob.mimeType,
  );

  const modelRequest = {
    model: request.model,
    messages: [
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: prompt }],
      },
    ],
    ...(request.config ? { config: request.config } : {}),
  };

  const prepared = await adapter.prepare(modelRequest);
  assertPreparedRequestAllowed(adapter.descriptor, prepared);
  if (new URL(prepared.url).hostname !== target.endpointHostname) {
    throw new Error("Prepared provider request does not match the catalog endpoint");
  }

  if (prepared.auth) {
    await deps.credentials.resolve(prepared.auth.credentialName);
  }

  return executePersistedProviderRun({
    repository: deps.repository,
    blobStore: deps.blobStore,
    adapter,
    transport: deps.transport,
    credentials: deps.credentials,
    signer: deps.signer,
    attestationPublicKeyPem: publicKeyPem(deps.signer.privateKey),
    request: modelRequest,
    run: {
      testCaseId: target.testCaseId,
      providerId: target.providerId,
      runnerBuild: deps.runnerBuild,
    },
    collector: deps.collector ?? "modelapse-runner/openai-direct",
    evidenceLevel: "E4",
  });
}
