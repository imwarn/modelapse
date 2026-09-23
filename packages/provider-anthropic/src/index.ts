import type {
  CanonicalModelRequest,
  HttpExchangeCapture,
  NormalizedProviderResponse,
  PreparedHttpRequest,
  ProviderAdapter,
  ProviderContentPart,
} from "@modelapse/provider-adapter";

function textOnly(parts: readonly ProviderContentPart[]): string {
  if (parts.some((part) => part.type !== "text")) {
    throw new Error("Anthropic Messages adapter v0.1 currently supports text inputs only");
  }
  return parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

export class AnthropicMessagesAdapter implements ProviderAdapter {
  readonly descriptor = {
    id: "anthropic-messages-direct-2023-06-01",
    providerSlug: "anthropic",
    executionPath: "first_party_direct" as const,
    allowedHosts: ["api.anthropic.com"],
    apiVersion: "2023-06-01",
  };

  prepare(request: CanonicalModelRequest): PreparedHttpRequest {
    if (request.config?.maxOutputTokens === undefined) {
      throw new Error(
        "Anthropic Messages requires config.maxOutputTokens; the adapter will not invent a benchmark parameter",
      );
    }

    const system = request.messages
      .filter((message) => message.role === "system")
      .map((message) => textOnly(message.content))
      .join("\n\n");

    const messages = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: textOnly(message.content),
      }));

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.config.maxOutputTokens,
      messages,
    };
    if (system) body.system = system;
    if (request.config.temperature !== undefined) {
      body.temperature = request.config.temperature;
    }
    if (request.config.topP !== undefined) {
      body.top_p = request.config.topP;
    }

    return {
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      auth: {
        kind: "header",
        header: "x-api-key",
        credentialName: "ANTHROPIC_API_KEY",
      },
      body: JSON.stringify(body),
      capture: {
        responseHeaderAllowlist: [
          "request-id",
          "anthropic-organization-id",
          "anthropic-workspace-id",
        ],
      },
    };
  }

  parse(
    capture: HttpExchangeCapture,
    request: CanonicalModelRequest,
  ): NormalizedProviderResponse {
    if (capture.status < 200 || capture.status >= 300) {
      throw new Error(`Anthropic API returned HTTP ${capture.status}`);
    }

    const body = JSON.parse(capture.responseBody) as Record<string, unknown>;
    const blocks = Array.isArray(body.content) ? body.content : [];
    const text = blocks
      .flatMap((part) => {
        if (!part || typeof part !== "object") return [];
        const record = part as Record<string, unknown>;
        return record.type === "text" && typeof record.text === "string"
          ? [record.text]
          : [];
      })
      .join("\n");

    const usage =
      body.usage && typeof body.usage === "object"
        ? (body.usage as Record<string, unknown>)
        : undefined;

    return {
      requestedModel: request.model,
      ...(typeof body.model === "string" ? { returnedModel: body.model } : {}),
      ...(typeof body.id === "string" ? { providerResponseId: body.id } : {}),
      ...(capture.responseHeaders["request-id"]
        ? { providerRequestId: capture.responseHeaders["request-id"] }
        : {}),
      content: [{ type: "text", text }],
      ...(usage
        ? {
            usage: {
              ...(typeof usage.input_tokens === "number"
                ? { inputTokens: usage.input_tokens }
                : {}),
              ...(typeof usage.output_tokens === "number"
                ? { outputTokens: usage.output_tokens }
                : {}),
              providerRaw: usage,
            },
          }
        : {}),
      providerMetadata: {
        ...(body.stop_reason !== undefined
          ? { stopReason: body.stop_reason }
          : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
      },
    };
  }
}
