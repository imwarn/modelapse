import {
  canonicalJson,
  sha256Utf8,
  signRunAttestation,
  type SignedRunAttestation,
} from "@modelapse/attestation";
import type { ExecutionPath, RunStatus } from "@modelapse/domain";
import {
  assertPreparedRequestAllowed,
  type CanonicalModelRequest,
  type CredentialResolver,
  type EvidenceTransport,
  type HttpExchangeCapture,
  type NormalizedProviderResponse,
  type PreparedHttpRequest,
  type ProviderAdapter,
} from "@modelapse/provider-adapter";
import { assertRunTransition } from "./state.js";

export interface RunSigner {
  readonly keyId: string;
  readonly privateKey: Parameters<typeof signRunAttestation>[0]["privateKey"];
}

export interface ProviderRunPlan {
  readonly runId: string;
  readonly runnerBuild: string;
  readonly adapter: ProviderAdapter;
  readonly request: CanonicalModelRequest;
  readonly transport: EvidenceTransport;
  readonly credentials: CredentialResolver;
  readonly signer: RunSigner;
  readonly onTransition?: (from: RunStatus, to: RunStatus) => void | Promise<void>;
}

export interface SealedProviderRun {
  readonly runId: string;
  readonly provider: string;
  readonly executionPath: ExecutionPath;
  readonly status: Extract<
    RunStatus,
    "completed" | "failed_request" | "invalid_output"
  >;
  readonly exchange: HttpExchangeCapture;
  readonly normalized?: NormalizedProviderResponse;
  readonly requestSha256: string;
  readonly responseSha256: string;
  readonly sealedAt: string;
  readonly attestation: SignedRunAttestation;
  readonly parseError?: string;
}

async function transition(
  plan: ProviderRunPlan,
  state: { current: RunStatus },
  to: RunStatus,
): Promise<void> {
  assertRunTransition(state.current, to);
  const from = state.current;
  state.current = to;
  await plan.onTransition?.(from, to);
}

function requestEvidenceHash(exchange: HttpExchangeCapture): string {
  return sha256Utf8(
    canonicalJson({
      url: exchange.url,
      method: exchange.method,
      headers: exchange.requestHeaders,
      body: exchange.requestBody,
    }),
  );
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export class RunPreparationError extends Error {
  constructor(readonly causeValue: unknown) {
    super("Provider request could not be prepared safely");
    this.name = "RunPreparationError";
  }
}

export class RunTransportError extends Error {
  constructor(
    readonly status: Extract<RunStatus, "timeout" | "failed_request">,
    readonly causeValue: unknown,
  ) {
    super(
      status === "timeout"
        ? "Provider request timed out before a response was captured"
        : "Provider request failed before a response was captured",
    );
    this.name = "RunTransportError";
  }
}

/**
 * Executes and seals the provider I/O portion of a Run.
 *
 * Persistence is deliberately outside this package. A caller should persist
 * state transitions and then atomically store the returned hashes,
 * attestation and sealed_at value.
 */
export async function executeProviderRun(
  plan: ProviderRunPlan,
): Promise<SealedProviderRun> {
  const state: { current: RunStatus } = { current: "planned" };
  await transition(plan, state, "executing");

  let prepared: PreparedHttpRequest;
  try {
    prepared = await plan.adapter.prepare(plan.request);
    assertPreparedRequestAllowed(plan.adapter.descriptor, prepared);
  } catch (error) {
    await transition(plan, state, "blocked");
    throw new RunPreparationError(error);
  }

  let exchange: HttpExchangeCapture;
  try {
    exchange = await plan.transport.execute({
      descriptor: plan.adapter.descriptor,
      request: prepared,
      credentials: plan.credentials,
    });
  } catch (error) {
    const terminal = isTimeout(error) ? "timeout" : "failed_request";
    await transition(plan, state, terminal);
    throw new RunTransportError(terminal, error);
  }

  await transition(plan, state, "response_captured");

  let status: SealedProviderRun["status"];
  let normalized: NormalizedProviderResponse | undefined;
  let parseError: string | undefined;

  if (exchange.status < 200 || exchange.status >= 300) {
    status = "failed_request";
  } else {
    try {
      normalized = await plan.adapter.parse(exchange, plan.request);
      status = "completed";
    } catch (error) {
      status = "invalid_output";
      parseError = error instanceof Error ? error.message : String(error);
    }
  }

  await transition(plan, state, status);

  const requestSha256 = requestEvidenceHash(exchange);
  const responseSha256 = sha256Utf8(exchange.responseBody);
  const sealedAt = new Date().toISOString();

  const attestation = signRunAttestation({
    keyId: plan.signer.keyId,
    privateKey: plan.signer.privateKey,
    payload: {
      schemaVersion: "1",
      runId: plan.runId,
      runnerBuild: plan.runnerBuild,
      provider: plan.adapter.descriptor.providerSlug,
      executionPath: plan.adapter.descriptor.executionPath,
      requestedModel: plan.request.model,
      ...(normalized?.returnedModel
        ? { returnedModel: normalized.returnedModel }
        : {}),
      ...(normalized?.providerRequestId
        ? { requestId: normalized.providerRequestId }
        : {}),
      ...(normalized?.providerResponseId
        ? { responseId: normalized.providerResponseId }
        : {}),
      httpStatus: exchange.status,
      requestSha256,
      responseSha256,
      startedAt: exchange.startedAt,
      completedAt: exchange.completedAt,
      sealedAt,
    },
  });

  return {
    runId: plan.runId,
    provider: plan.adapter.descriptor.providerSlug,
    executionPath: plan.adapter.descriptor.executionPath,
    status,
    exchange,
    ...(normalized ? { normalized } : {}),
    requestSha256,
    responseSha256,
    sealedAt,
    attestation,
    ...(parseError ? { parseError } : {}),
  };
}
