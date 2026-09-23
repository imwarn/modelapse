import type { BlobDescriptor } from "@modelapse/blob-store";
import type {
  EvidenceLevel,
  ExecutionPath,
  RunConfig,
  RunStatus,
} from "@modelapse/domain";
import type { NormalizedUsage } from "@modelapse/provider-adapter";

export interface CreatePlannedRunInput {
  readonly testCaseId: string;
  readonly modelId?: string;
  readonly snapshotId?: string;
  readonly providerId: string;
  readonly executionPath: ExecutionPath;
  readonly requestedModel: string;
  readonly runnerBuild: string;
  readonly config?: RunConfig;
}

export interface ProviderMetadataInput {
  readonly providerRequestId?: string;
  readonly providerResponseId?: string;
  readonly modelVersion?: string;
  readonly upstreamId?: string;
  readonly routedProviderName?: string;
  readonly usage?: NormalizedUsage;
  readonly timing?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SealRunInput {
  readonly runId: string;
  readonly status: Extract<
    RunStatus,
    "completed" | "failed_request" | "invalid_output"
  >;
  readonly returnedModel?: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly sealedAt: string;
  readonly requestBlob: BlobDescriptor;
  readonly responseBlob: BlobDescriptor;
  readonly responseHeadersBlob: BlobDescriptor;
  readonly attestationPayloadBlob: BlobDescriptor;
  readonly providerMetadata?: ProviderMetadataInput;
  readonly attestation: {
    readonly keyId: string;
    readonly algorithm: "Ed25519";
    readonly publicKeyPem: string;
    readonly validFrom: string;
    readonly signatureBase64: string;
  };
  readonly evidence: {
    readonly level: EvidenceLevel;
    readonly executionPath: ExecutionPath;
    readonly collector: string;
    readonly notes?: string;
  };
}

export interface RunView {
  readonly id: string;
  readonly testCaseId: string;
  readonly modelId: string | null;
  readonly snapshotId: string | null;
  readonly providerId: string;
  readonly executionPath: ExecutionPath;
  readonly requestedModel: string;
  readonly returnedModel: string | null;
  readonly status: RunStatus;
  readonly runnerBuild: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly sealedAt: string | null;
  readonly createdAt: string;
  readonly config: Readonly<Record<string, unknown>> | null;
  readonly providerMetadata: Readonly<Record<string, unknown>> | null;
  readonly requestBlob: BlobDescriptor | null;
  readonly responseBlob: BlobDescriptor | null;
  readonly evidence: readonly Readonly<Record<string, unknown>>[];
  readonly attestations: readonly Readonly<Record<string, unknown>>[];
}

export interface RunRepository {
  ping(): Promise<void>;
  createPlannedRun(input: CreatePlannedRunInput): Promise<RunView>;
  markStatus(runId: string, status: RunStatus): Promise<void>;
  sealRun(input: SealRunInput): Promise<RunView>;
  getRun(runId: string): Promise<RunView | null>;
}

export interface DirectExecutionTarget {
  readonly testCaseId: string;
  readonly providerId: string;
  readonly providerSlug: string;
  readonly endpointBaseUrl: string;
  readonly endpointHostname: string;
  readonly promptBlob: BlobDescriptor;
}

export interface ExecutionCatalogRepository {
  resolveDirectExecutionTarget(input: {
    readonly testCaseId: string;
    readonly providerSlug: string;
    readonly endpointHostname: string;
  }): Promise<DirectExecutionTarget>;
}
