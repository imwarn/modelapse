import {
  createHash,
  createPrivateKey,
  createPublicKey,
  type KeyObject,
} from "node:crypto";
import type { BlobStore } from "@modelapse/blob-store";
import type {
  DirectProviderRunRequest,
  ExecutionEnvironmentDescriptor,
} from "@modelapse/control-plane";
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

export interface DirectProviderRunDependencies {
  readonly repository: RunRepository & ExecutionCatalogRepository;
  readonly blobStore: BlobStore;
  readonly transport: EvidenceTransport;
  readonly credentials: CredentialResolver;
  readonly signer: {
    readonly keyId: string;
    readonly privateKey: string | KeyObject;
  };
  readonly runnerBuild: string;
  readonly executionEnvironment?: ExecutionEnvironmentDescriptor;
  readonly executionRegion?: string;
  readonly collector?: string;
}

function publicKeyPem(privateKey: string | KeyObject): string {
  const key =
    typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  return createPublicKey(key)
    .export({ type: "spki", format: "pem" })
    .toString();
}

function qualificationEnvelope(
  request: DirectProviderRunRequest,
  executionEnvironment: ExecutionEnvironmentDescriptor | undefined,
  executionRegion: string | undefined,
) {
  const plan = request.qualification;
  const fleet = request.fleet;

  if (fleet) {
    if (!executionEnvironment) {
      throw new Error(
        "Fleet-planned Run requires a configured execution environment",
      );
    }
    if (
      executionEnvironment.id !== fleet.environmentId ||
      executionEnvironment.slug !== fleet.environmentSlug ||
      executionEnvironment.region !== fleet.region ||
      executionEnvironment.accountTier !== (fleet.accountTier ?? null) ||
      executionEnvironment.serviceTier !== (fleet.serviceTier ?? null) ||
      executionEnvironment.serviceAssurance !== fleet.serviceAssurance
    ) {
      throw new Error(
        "Worker execution environment does not match the frozen fleet plan",
      );
    }
  }

  const region =
    executionEnvironment?.region ??
    executionRegion?.trim() ??
    undefined;
  const accountTier =
    executionEnvironment?.accountTier ??
    plan?.accountTier ??
    undefined;
  const serviceTier =
    executionEnvironment?.serviceTier ??
    plan?.serviceTier ??
    undefined;
  const serviceAssurance =
    executionEnvironment?.serviceAssurance ??
    plan?.serviceAssurance ??
    ("unknown" as const);

  const caveats = new Set(
    plan?.caveats ?? ["testability_evidence_not_planned"],
  );
  if (!region) caveats.add("execution_region_unknown");
  if (fleet && executionEnvironment) {
    caveats.delete("execution_fleet_unconfigured");
  }

  return {
    selectedAt: plan?.selectedAt ?? new Date().toISOString(),
    ...(executionEnvironment
      ? { executionEnvironmentId: executionEnvironment.id }
      : {}),
    ...(region ? { executionRegion: region } : {}),
    ...(plan?.providerPolicyObservationId
      ? { providerPolicyObservationId: plan.providerPolicyObservationId }
      : {}),
    ...(plan?.runnerAccessObservationId
      ? { runnerAccessObservationId: plan.runnerAccessObservationId }
      : {}),
    ...(accountTier ? { accountTier } : {}),
    ...(serviceTier ? { serviceTier } : {}),
    ...(plan?.requestedServiceTier
      ? { requestedServiceTier: plan.requestedServiceTier }
      : {}),
    serviceAssurance,
    caveats: [...caveats],
  };
}

function costEnvelope(request: DirectProviderRunRequest) {
  const plan = request.cost;
  return {
    selectedAt: plan?.selectedAt ?? new Date().toISOString(),
    ...(plan?.pricingObservationId
      ? { pricingObservationId: plan.pricingObservationId }
      : {}),
    ...(plan?.currency ? { currency: plan.currency } : {}),
    ...(plan?.inputPricePerMillion
      ? { inputPricePerMillion: plan.inputPricePerMillion }
      : {}),
    ...(plan?.outputPricePerMillion
      ? { outputPricePerMillion: plan.outputPricePerMillion }
      : {}),
    ...(plan?.perRequest ? { perRequest: plan.perRequest } : {}),
    caveats: plan?.caveats ?? ["pricing_evidence_not_planned"],
  };
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

export async function runDirectProvider(
  request: DirectProviderRunRequest,
  deps: DirectProviderRunDependencies,
  adapter: ProviderAdapter,
  defaultCollector: string,
) {
  if (!deps.runnerBuild.trim()) {
    throw new Error("runnerBuild is required");
  }
  if (!deps.signer.keyId.trim()) {
    throw new Error("attestation key id is required");
  }
  if (
    adapter.descriptor.providerSlug !== request.provider ||
    adapter.descriptor.executionPath !== "first_party_direct"
  ) {
    throw new Error(
      "Direct runner request does not match its first-party provider adapter",
    );
  }

  const endpointHostname = adapter.descriptor.allowedHosts[0];
  if (!endpointHostname) {
    throw new Error("Direct provider adapter must declare an allowed host");
  }

  const target = await deps.repository.resolveDirectExecutionTarget({
    testCaseId: request.testCaseId,
    providerSlug: adapter.descriptor.providerSlug,
    endpointHostname,
    ...(request.modelId
      ? {
          modelId: request.modelId,
          requestedModel: request.model,
        }
      : {}),
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
      ...(target.modelId ? { modelId: target.modelId } : {}),
      ...(target.snapshotId ? { snapshotId: target.snapshotId } : {}),
      providerId: target.providerId,
      runnerBuild: deps.runnerBuild,
      executionQualification: qualificationEnvelope(
        request,
        deps.executionEnvironment,
        deps.executionRegion,
      ),
      runCost: costEnvelope(request),
    },
    collector: deps.collector ?? defaultCollector,
    evidenceLevel: "E4",
  });
}
