import type { BlobStore } from "@modelapse/blob-store";
import {
  parseDirectOpenAIRunRequest,
  type PgRunJobQueue,
  type RunJob,
} from "@modelapse/control-plane";
import type {
  CredentialResolver,
  EvidenceTransport,
} from "@modelapse/provider-adapter";
import type {
  ExecutionCatalogRepository,
  RunRepository,
} from "@modelapse/persistence";
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
    const request = parseDirectOpenAIRunRequest(job.payload);
    const result = await runDirectOpenAI(request, {
      repository: deps.repository,
      blobStore: deps.blobStore,
      transport: deps.transport,
      credentials: deps.credentials,
      signer: deps.signer,
      runnerBuild: deps.runnerBuild,
      ...(deps.collector ? { collector: deps.collector } : {}),
    });
    runId = result.run.id;
  } catch (error) {
    return deps.queue.fail({
      jobId: job.id,
      workerId: deps.workerId,
      error: safeError(error),
    });
  }

  return deps.queue.succeed({
    jobId: job.id,
    workerId: deps.workerId,
    runId,
  });
}
