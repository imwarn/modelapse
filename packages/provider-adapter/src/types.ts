import type { ExecutionPath, RunConfig } from "@modelapse/domain";

export type ProviderContentPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "image";
      readonly mimeType: string;
      readonly dataBase64: string;
    };

export interface ProviderMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: readonly ProviderContentPart[];
}

export interface CanonicalModelRequest {
  readonly model: string;
  readonly messages: readonly ProviderMessage[];
  readonly config?: RunConfig;
  readonly metadata?: Readonly<Record<string, string>>;
}

export type ProviderAuthSpec =
  | {
      readonly kind: "bearer";
      readonly credential: string;
    }
  | {
      readonly kind: "header";
      readonly header: string;
      readonly credential: string;
    }
  | {
      readonly kind: "query";
      readonly parameter: string;
      readonly credential: string;
    };

export interface PreparedHttpRequest {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly auth?: ProviderAuthSpec;
  readonly body?: string;
  readonly capture: {
    readonly responseHeaderAllowlist: readonly string[];
  };
}

export interface HttpExchangeCapture {
  readonly url: string;
  readonly method: string;
  readonly status: number;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly requestBody: string;
  readonly responseBody: string;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface NormalizedUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly providerRaw?: Readonly<Record<string, unknown>>;
}

export interface NormalizedProviderResponse {
  readonly requestedModel: string;
  readonly returnedModel?: string;
  readonly modelVersion?: string;
  readonly providerRequestId?: string;
  readonly providerResponseId?: string;
  readonly upstreamId?: string;
  readonly routedProviderName?: string;
  readonly content: readonly ProviderContentPart[];
  readonly usage?: NormalizedUsage;
  readonly providerMetadata?: Readonly<Record<string, unknown>>;
}

export interface ProviderAdapterDescriptor {
  readonly id: string;
  readonly providerSlug: string;
  readonly executionPath: ExecutionPath;
  /** Hostnames the controlled transport is allowed to contact for this adapter. */
  readonly allowedHosts: readonly string[];
  readonly apiVersion?: string;
}
