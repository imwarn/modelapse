import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import type { BlobStore } from "@modelapse/blob-store";
import type { RunConfig } from "@modelapse/domain";
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

export interface DirectOpenAIRunRequest {
  readonly provider: "openai";
  readonly testCaseId: string;
  readonly model: string;
  readonly config?: Pick<
    RunConfig,
    | "temperature"
    | "topP"
    | "maxOutputTokens"
    | "reasoningEffort"
    | "serviceTier"
  >;
}

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const set = new Set(allowed);
  const unknown = Object.keys(record).filter((key) => !set.has(key));
  if (unknown.length > 0) {
    throw new Error(label + " contains unsupported fields: " + unknown.join(", "));
  }
}

function optionalFiniteNumber(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("config." + key + " must be a finite number");
  }
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("config." + key + " must be a non-empty string");
  }
  return value;
}

function parseConfig(value: unknown): DirectOpenAIRunRequest["config"] {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new Error("config must be an object");

  rejectUnknownKeys(
    value,
    [
      "temperature",
      "topP",
      "maxOutputTokens",
      "reasoningEffort",
      "serviceTier",
    ],
    "config",
  );

  const temperature = optionalFiniteNumber(value, "temperature");
  const topP = optionalFiniteNumber(value, "topP");
  const maxOutputTokens = optionalFiniteNumber(value, "maxOutputTokens");
  const reasoningEffort = optionalString(value, "reasoningEffort");
  const serviceTier = optionalString(value, "serviceTier");

  if (
    maxOutputTokens !== undefined &&
    (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0)
  ) {
    throw new Error("config.maxOutputTokens must be a positive integer");
  }
  if (topP !== undefined && (topP < 0 || topP > 1)) {
    throw new Error("config.topP must be between 0 and 1");
  }

  return {
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { topP } : {}),
    ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
    ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    ...(serviceTier !== undefined ? { serviceTier } : {}),
  };
}

export function parseDirectOpenAIRunRequest(
  value: unknown,
): DirectOpenAIRunRequest {
  if (!isRecord(value)) throw new Error("job payload must be an object");

  rejectUnknownKeys(value, ["provider", "testCaseId", "model", "config"], "job");

  if (value.provider !== "openai") {
    throw new Error('provider must be "openai"');
  }
  if (typeof value.testCaseId !== "string" || !UUID_RE.test(value.testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }
  if (typeof value.model !== "string" || value.model.trim().length === 0) {
    throw new Error("model must be a non-empty string");
  }

  const config = parseConfig(value.config);

  return {
    provider: "openai",
    testCaseId: value.testCaseId,
    model: value.model,
    ...(config ? { config } : {}),
  };
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

  const keyPem = publicKeyPem(deps.signer.privateKey);

  return executePersistedProviderRun({
    repository: deps.repository,
    blobStore: deps.blobStore,
    adapter,
    transport: deps.transport,
    credentials: deps.credentials,
    signer: deps.signer,
    attestationPublicKeyPem: keyPem,
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
