import type {
  HttpExchangeCapture,
  PreparedHttpRequest,
  ProviderAdapterDescriptor,
} from "./types.js";

export interface CredentialResolver {
  resolve(name: string): Promise<string>;
}

export interface EvidenceTransport {
  /**
   * Executes a prepared request after endpoint validation and credential
   * injection. Implementations must capture a redacted request/response pair.
   */
  execute(input: {
    readonly descriptor: ProviderAdapterDescriptor;
    readonly request: PreparedHttpRequest;
    readonly credentials: CredentialResolver;
  }): Promise<HttpExchangeCapture>;
}
