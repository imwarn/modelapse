import type {
  CanonicalModelRequest,
  HttpExchangeCapture,
  NormalizedProviderResponse,
  PreparedHttpRequest,
  ProviderAdapterDescriptor,
} from "./types.js";

/**
 * Provider adapters are deliberately transport-free.
 *
 * An adapter may construct a request and normalize a captured response, but it
 * must not call fetch() itself. A Modelapse-controlled transport owns DNS/TLS,
 * credentials, network allowlists, raw byte capture, redaction and timestamps.
 * That separation is what lets a run truthfully claim a known execution path.
 */
export interface ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;

  prepare(request: CanonicalModelRequest): Promise<PreparedHttpRequest> | PreparedHttpRequest;

  parse(
    capture: HttpExchangeCapture,
    request: CanonicalModelRequest,
  ): Promise<NormalizedProviderResponse> | NormalizedProviderResponse;
}

export function assertPreparedRequestAllowed(
  descriptor: ProviderAdapterDescriptor,
  request: PreparedHttpRequest,
): void {
  const host = new URL(request.url).hostname.toLowerCase();
  const allowed = descriptor.allowedHosts.some(
    (candidate) => candidate.toLowerCase() === host,
  );

  if (!allowed) {
    throw new Error(
      `Provider adapter ${descriptor.id} attempted disallowed host ${host}`,
    );
  }

  if (request.url.startsWith("http://")) {
    throw new Error(`Provider adapter ${descriptor.id} must use HTTPS`);
  }
}
