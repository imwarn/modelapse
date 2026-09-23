import type {
  ArtifactId,
  ModelId,
  ModelSnapshotId,
  ProviderId,
  RunId,
  Sha256,
  TestCaseId,
} from "./ids.js";
import type { ExecutionPath } from "./provenance.js";
import type { ArtifactType } from "./test.js";

export const runStatuses = [
  "planned",
  "executing",
  "response_captured",
  "completed",
  "failed_request",
  "blocked",
  "timeout",
  "invalid_output",
  "artifact_failed",
] as const;
export type RunStatus = (typeof runStatuses)[number];

export interface RunConfig {
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  readonly reasoningMode?: string;
  readonly reasoningEffort?: string;
  readonly seed?: number;
  readonly serviceTier?: string;
  readonly tools?: unknown;
  readonly providerConfig?: unknown;
}

export interface Run {
  readonly id: RunId;
  readonly testCaseId: TestCaseId;
  readonly modelId?: ModelId;
  readonly snapshotId?: ModelSnapshotId;
  readonly providerId: ProviderId;
  readonly executionPath: ExecutionPath;
  readonly requestedModel: string;
  readonly returnedModel?: string;
  readonly status: RunStatus;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly sealedAt?: string;
  readonly runnerBuild: string;
}

export interface ProviderRunMetadata {
  readonly providerRequestId?: string;
  readonly providerResponseId?: string;
  readonly modelVersion?: string;
  readonly upstreamId?: string;
  readonly routedProviderName?: string;
  readonly usage?: Record<string, unknown>;
  readonly timing?: Record<string, unknown>;
}

export interface Artifact {
  readonly id: ArtifactId;
  readonly runId: RunId;
  readonly kind: ArtifactType;
  readonly originalSha256: Sha256;
  readonly manifestSha256?: Sha256;
  readonly status: "created" | "invalid" | "capture_failed";
}
