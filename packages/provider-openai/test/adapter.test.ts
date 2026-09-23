import { describe, expect, it } from "vitest";
import { OpenAIResponsesAdapter } from "../src/index.js";

const request = {
  model: "gpt-test",
  messages: [
    { role: "system" as const, content: [{ type: "text" as const, text: "System" }] },
    { role: "user" as const, content: [{ type: "text" as const, text: "Hello" }] },
  ],
  config: { maxOutputTokens: 512 },
};

describe("OpenAIResponsesAdapter", () => {
  it("prepares a direct Responses request without embedding credentials", () => {
    const prepared = new OpenAIResponsesAdapter().prepare(request);
    expect(prepared.url).toBe("https://api.openai.com/v1/responses");
    expect(prepared.auth).toEqual({
      kind: "bearer",
      credentialName: "OPENAI_API_KEY",
    });
    expect(prepared.body).not.toContain("OPENAI_API_KEY");
  });

  it("normalizes response identifiers and output text", () => {
    const adapter = new OpenAIResponsesAdapter();
    const normalized = adapter.parse(
      {
        url: "https://api.openai.com/v1/responses",
        method: "POST",
        status: 200,
        requestHeaders: {},
        responseHeaders: { "x-request-id": "req_123" },
        requestBody: "{}",
        responseBody: JSON.stringify({
          id: "resp_123",
          model: "gpt-test-2026-09-01",
          output_text: "hello",
          usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
        }),
        startedAt: "2026-09-23T00:00:00.000Z",
        completedAt: "2026-09-23T00:00:01.000Z",
      },
      request,
    );

    expect(normalized.providerRequestId).toBe("req_123");
    expect(normalized.providerResponseId).toBe("resp_123");
    expect(normalized.returnedModel).toBe("gpt-test-2026-09-01");
    expect(normalized.content[0]).toEqual({ type: "text", text: "hello" });
  });
});
