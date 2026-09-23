import {
  assertPreparedRequestAllowed,
  type CredentialResolver,
  type EvidenceTransport,
  type HttpExchangeCapture,
  type PreparedHttpRequest,
  type ProviderAdapterDescriptor,
} from "@modelapse/provider-adapter";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface NodeEvidenceTransportOptions {
  readonly fetch?: FetchLike;
  readonly timeoutMs?: number;
}

function redactHeader(
  headers: Record<string, string>,
  name: string,
): void {
  const matching = Object.keys(headers).find(
    (key) => key.toLowerCase() === name.toLowerCase(),
  );
  if (matching) headers[matching] = "[REDACTED]";
}

function pickHeaders(
  headers: Headers,
  allowlist: readonly string[],
): Record<string, string> {
  const allowed = new Set(allowlist.map((value) => value.toLowerCase()));
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (allowed.has(key.toLowerCase())) result[key.toLowerCase()] = value;
  });
  return result;
}

async function applyAuth(
  request: PreparedHttpRequest,
  credentials: CredentialResolver,
): Promise<{ url: URL; headers: Record<string, string>; redactedHeaders: Record<string, string> }> {
  const url = new URL(request.url);
  const headers = { ...request.headers };

  if (!request.auth) {
    return { url, headers, redactedHeaders: { ...headers } };
  }

  const credential = await credentials.resolve(request.auth.credentialName);

  if (request.auth.kind === "bearer") {
    headers.authorization = `Bearer ${credential}`;
  } else if (request.auth.kind === "header") {
    headers[request.auth.header] = credential;
  } else {
    url.searchParams.set(request.auth.parameter, credential);
  }

  const redactedHeaders = { ...headers };
  if (request.auth.kind === "bearer") {
    redactHeader(redactedHeaders, "authorization");
  } else if (request.auth.kind === "header") {
    redactHeader(redactedHeaders, request.auth.header);
  }

  return { url, headers, redactedHeaders };
}

/**
 * Node Fetch implementation of the controlled evidence transport.
 *
 * Application-level host validation is defense-in-depth. Production E4 runners
 * should additionally enforce outbound network policy at the container/VPS
 * layer so the process cannot bypass this transport.
 */
export class NodeEvidenceTransport implements EvidenceTransport {
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;

  constructor(options: NodeEvidenceTransportOptions = {}) {
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs ?? 120_000;
  }

  async execute(input: {
    readonly descriptor: ProviderAdapterDescriptor;
    readonly request: PreparedHttpRequest;
    readonly credentials: CredentialResolver;
  }): Promise<HttpExchangeCapture> {
    assertPreparedRequestAllowed(input.descriptor, input.request);
    const { url, headers, redactedHeaders } = await applyAuth(
      input.request,
      input.credentials,
    );

    const startedAt = new Date().toISOString();
    const response = await this.#fetch(url, {
      method: input.request.method,
      headers,
      ...(input.request.body !== undefined ? { body: input.request.body } : {}),
      redirect: "manual",
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    const responseBody = await response.text();
    const completedAt = new Date().toISOString();

    return {
      // Keep the credential-free URL from the adapter, never a query-auth URL.
      url: input.request.url,
      method: input.request.method,
      status: response.status,
      requestHeaders: redactedHeaders,
      responseHeaders: pickHeaders(
        response.headers,
        input.request.capture.responseHeaderAllowlist,
      ),
      requestBody: input.request.body ?? "",
      responseBody,
      startedAt,
      completedAt,
    };
  }
}

export class EnvironmentCredentialResolver implements CredentialResolver {
  constructor(
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
  ) {}

  async resolve(name: string): Promise<string> {
    const value = this.env[name];
    if (!value) throw new Error(`Missing credential: ${name}`);
    return value;
  }
}
