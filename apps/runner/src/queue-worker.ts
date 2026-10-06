import type { BlobStore } from "@modelapse/blob-store";
import {
  parseDirectProviderRunRequest,
  type ExecutionEnvironmentDescriptor,
  type PgRunJobQueue,
  type RunJob,
} from "@modelapse/control-plane";
import type {
  CredentialResolver,
  EvidenceTransport,
} from "@modelapse/provider-adapter";
import {
  PersistedRunExecutionError,
  type ExecutionCatalogRepository,
  type PgCalibrationRepository,
  type PgEvaluationRepository,
  type RunRepository,
} from "@modelapse/persistence";
import { evaluateCompletedRun } from "./evaluate-run.js";
import { runDirectDeepSeek } from "./direct-deepseek.js";
import { runDirectOpenAI } from "./direct-openai.js";

export interface QueueWorkerDependencies {
  readonly queue: PgRunJobQueue;
  readonly repository: RunRepository & ExecutionCatalogRepository;
  readonly evaluations: Pick<
    PgEvaluationRepository,
    "resolveForRun" | "recordExactText"
  >;
  readonly calibration?: Pick<PgCalibrationRepository, "recordForRun">;
  readonly blobStore: BlobStore;
  readonly transport: EvidenceTransport;
  readonly credentials: CredentialResolver;
  readonly signer: {
    readonly keyId: string;
    readonly privateKey: string | import("node:crypto").KeyObject;
  };
  readonly runnerBuild: string;
  readonly executionEnvironment?: ExecutionEnvironmentDescriptor;
  readonly executionRegion?: string;
  readonly workerId: string;
  readonly leaseSeconds: number;
  readonly collector?: string;
}

function safeError(error: unknown): string {
  if (error instanceof Error) {
    return (error.name + ": " + error.message).slice(0, 2000);
  }
  return "Run job failed";
}

export async function processOneQueuedRunJob(
  deps: QueueWorkerDependencies,
): Promise<RunJob | null> {
  const job = await deps.queue.claimNext({
    workerId: deps.workerId,
    leaseSeconds: deps.leaseSeconds,
    ...(deps.executionEnvironment
      ? { executionEnvironmentId: deps.executionEnvironment.id }
      : {}),
  });
  if (!job) return null;

  let runId: string | undefined;
  try {
    const request = parseDirectProviderRunRequest(job.payload);
    const providerDeps = {
      repository: deps.repository,
      blobStore: deps.blobStore,
      transport: deps.transport,
      credentials: deps.credentials,
      signer: deps.signer,
      runnerBuild: deps.runnerBuild,
      ...(deps.executionEnvironment
        ? { executionEnvironment: deps.executionEnvironment }
        : {}),
      ...(deps.executionRegion
        ? { executionRegion: deps.executionRegion }
        : {}),
      ...(deps.collector ? { collector: deps.collector } : {}),
    };

    const result =
      request.provider === "openai"
        ? await runDirectOpenAI(request, providerDeps)
        : await runDirectDeepSeek(request, providerDeps);

    runId = result.run.id;

    if (result.run.status === "completed") {
      const evaluation = await evaluateCompletedRun({
        runId,
        normalized: result.sealed.normalized,
        blobStore: deps.blobStore,
        evaluations: deps.evaluations,
      });
      if (evaluation && deps.calibration) {
        await deps.calibration.recordForRun(runId);
      }
    }
  } catch (error) {
    const failedRunId =
      runId ??
      (error instanceof PersistedRunExecutionError ? error.runId : undefined);

    return deps.queue.fail({
      jobId: job.id,
      workerId: deps.workerId,
      error: safeError(error),
      ...(failedRunId ? { runId: failedRunId } : {}),
    });
  }

  if (!runId) {
    throw new Error("Run job completed without a Run id");
  }

  return deps.queue.succeed({
    jobId: job.id,
    workerId: deps.workerId,
    runId,
  });
}
