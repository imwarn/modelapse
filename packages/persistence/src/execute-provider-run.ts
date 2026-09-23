import type { BlobStore } from "@modelapse/blob-store";
import type { EvidenceLevel } from "@modelapse/domain";
import type {
  CanonicalModelRequest,
  CredentialResolver,
  EvidenceTransport,
  ProviderAdapter,
} from "@modelapse/provider-adapter";
import {
  executeProviderRun,
  type RunSigner,
  type SealedProviderRun,
} from "@modelapse/runner";
import { persistSealedProviderRun } from "./record-provider-run.js";
import type {
  CreatePlannedRunInput,
  RunRepository,
  RunView,
} from "./types.js";

export interface ExecutePersistedProviderRunInput {
  readonly repository: RunRepository;
  readonly blobStore: BlobStore;
  readonly adapter: ProviderAdapter;
  readonly transport: EvidenceTransport;
  readonly credentials: CredentialResolver;
  readonly signer: RunSigner;
  readonly attestationPublicKeyPem: string;
  readonly request: CanonicalModelRequest;
  readonly run: Omit<
    CreatePlannedRunInput,
    "executionPath" | "requestedModel"
  >;
  readonly collector: string;
  readonly evidenceLevel?: EvidenceLevel;
  readonly evidenceNotes?: string;
}

export interface ExecutePersistedProviderRunResult {
  readonly sealed: SealedProviderRun;
  readonly run: RunView;
}

export class PersistedRunExecutionError extends Error {
  readonly runId: string;
  readonly originalCause: unknown;

  constructor(runId: string, cause: unknown) {
    super(
      cause instanceof Error
        ? cause.message
        : "Persisted provider Run execution failed",
    );
    this.name = "PersistedRunExecutionError";
    this.runId = runId;
    this.originalCause = cause;
  }
}

/**
 * Creates the catalog Run first, persists every state transition, then archives
 * exact captured bytes and seals the Run.
 *
 * Transport/preparation failures are deliberately left as unsealed terminal
 * Runs because no provider response exists to attest. A later retry is a new
 * Run linked at the application layer rather than a mutation of history.
 */
export async function executePersistedProviderRun(
  input: ExecutePersistedProviderRunInput,
): Promise<ExecutePersistedProviderRunResult> {
  const planned = await input.repository.createPlannedRun({
    ...input.run,
    executionPath: input.adapter.descriptor.executionPath,
    requestedModel: input.request.model,
    ...(input.request.config ? { config: input.request.config } : {}),
  });

  try {
    const sealed = await executeProviderRun({
      runId: planned.id,
      runnerBuild: input.run.runnerBuild,
      adapter: input.adapter,
      request: input.request,
      transport: input.transport,
      credentials: input.credentials,
      signer: input.signer,
      onTransition: async (_from, to) => {
        await input.repository.markStatus(planned.id, to);
      },
    });

    const run = await persistSealedProviderRun({
      repository: input.repository,
      blobStore: input.blobStore,
      sealed,
      attestationKey: {
        publicKeyPem: input.attestationPublicKeyPem,
        validFrom: sealed.exchange.startedAt,
      },
      collector: input.collector,
      ...(input.evidenceLevel
        ? { evidenceLevel: input.evidenceLevel }
        : {}),
      ...(input.evidenceNotes
        ? { evidenceNotes: input.evidenceNotes }
        : {}),
    });

    return { sealed, run };
  } catch (error) {
    throw new PersistedRunExecutionError(planned.id, error);
  }
}
