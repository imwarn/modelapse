import type { BlobStore } from "@modelapse/blob-store";
import {
  parseDirectProviderRunRequest,
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
  type RunRepository,
} from "@modelapse/persistence";
import { runDirectDeepSeek } from "./direct-deepseek.js";
import { runDirectOpenAI } from "./direct-openai.js";

export interface QueueWorkerDependencies {
  readonly queue: PgRunJobQueue;
  readonly repository: RunRepository & ExecutionCatalogRepository;
  readonly blobStore: BlobStore;
  readonly transport: EvidenceTransport;
  readonly credentials: CredentialResolver;
  readonly signer: {
    readonly keyId: string;
    readonly privateKey: string | import("node:crypto").KeyObject;
  };
  readonly runnerBuild: string;
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
  });
  if (!job) return null;

  let runId: string;
  try {
    const request = parseDirectProviderRunRequest(job.payload);
    const providerDeps = {
      repository: deps.repository,
      blobStore: deps.blobStore,
      transport: deps.transport,
      credentials: deps.credentials,
      signer: deps.signer,
      runnerBuild: deps.runnerBuild,
      ...(deps.collector ? { collector: deps.collector } : {}),
    };

    const result =
      request.provider === "openai"
        ? await runDirectOpenAI(request, providerDeps)
        : await runDirectDeepSeek(request, providerDeps);
    runId = result.run.id;
  } catch (error) {
    return deps.queue.fail({
      jobId: job.id,
      workerId: deps.workerId,
      error: safeError(error),
      ...(error instanceof PersistedRunExecutionError
        ? { runId: error.runId }
        : {}),
    });
  }

  return deps.queue.succeed({
    jobId: job.id,
    workerId: deps.workerId,
    runId,
  });
}
