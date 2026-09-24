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
    throw new Error("DeepSeek Responses adapter v0.1 currently supports text inputs only");
  }
  return parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

function outputText(body: Record<string, unknown>): string {
  if (typeof body.output_text === "string") return body.output_text;

  const output = Array.isArray(body.output) ? body.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "message") continue;

    const content = Array.isArray(record.content) ? record.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const contentRecord = part as Record<string, unknown>;
      if (
        contentRecord.type === "output_text" &&
        typeof contentRecord.text === "string"
      ) {
        chunks.push(contentRecord.text);
      }
    }
  }

  return chunks.join("\n");
}

export class DeepSeekResponsesAdapter implements ProviderAdapter {
  readonly descriptor = {
    id: "deepseek-responses-direct-v1",
    providerSlug: "deepseek",
    executionPath: "first_party_direct" as const,
    allowedHosts: ["api.deepseek.com"],
    apiVersion: "responses-v1",
  };

  prepare(request: CanonicalModelRequest): PreparedHttpRequest {
    if (request.config?.serviceTier !== undefined) {
      throw new Error("DeepSeek Responses API does not support serviceTier");
    }

    const instructions = request.messages
      .filter((message) => message.role === "system")
      .map((message) => textOnly(message.content))
      .join("\n\n");

    const input = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: textOnly(message.content),
      }));

    const body: Record<string, unknown> = {
      model: request.model,
      input,
    };

    if (instructions) body.instructions = instructions;
    if (request.config?.maxOutputTokens !== undefined) {
      body.max_output_tokens = request.config.maxOutputTokens;
    }
    if (request.config?.temperature !== undefined) {
      body.temperature = request.config.temperature;
    }
    if (request.config?.topP !== undefined) {
      body.top_p = request.config.topP;
    }
    if (request.config?.reasoningEffort !== undefined) {
      body.reasoning = { effort: request.config.reasoningEffort };
    }

    return {
      url: "https://api.deepseek.com/responses",
      method: "POST",
      headers: { "content-type": "application/json" },
      auth: { kind: "bearer", credentialName: "DEEPSEEK_API_KEY" },
      body: JSON.stringify(body),
      capture: {
        responseHeaderAllowlist: ["content-type", "x-request-id"],
      },
    };
  }

  parse(
    capture: HttpExchangeCapture,
    request: CanonicalModelRequest,
  ): NormalizedProviderResponse {
    if (capture.status < 200 || capture.status >= 300) {
      throw new Error(`DeepSeek API returned HTTP ${capture.status}`);
    }

    const body = JSON.parse(capture.responseBody) as Record<string, unknown>;
    const usage =
      body.usage && typeof body.usage === "object"
        ? (body.usage as Record<string, unknown>)
        : undefined;

    return {
      requestedModel: request.model,
      ...(typeof body.model === "string" ? { returnedModel: body.model } : {}),
      ...(typeof body.id === "string" ? { providerResponseId: body.id } : {}),
      ...(capture.responseHeaders["x-request-id"]
        ? { providerRequestId: capture.responseHeaders["x-request-id"] }
        : {}),
      content: [{ type: "text", text: outputText(body) }],
      ...(usage
        ? {
            usage: {
              ...(typeof usage.input_tokens === "number"
                ? { inputTokens: usage.input_tokens }
                : {}),
              ...(typeof usage.output_tokens === "number"
                ? { outputTokens: usage.output_tokens }
                : {}),
              ...(typeof usage.total_tokens === "number"
                ? { totalTokens: usage.total_tokens }
                : {}),
              providerRaw: usage,
            },
          }
        : {}),
      providerMetadata: {
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    };
  }
}
