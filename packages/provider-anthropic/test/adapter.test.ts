import { describe, expect, it } from "vitest";
import { AnthropicMessagesAdapter } from "../src/index.js";

const request = {
  model: "claude-test",
  messages: [
    { role: "user" as const, content: [{ type: "text" as const, text: "Hello" }] },
  ],
  config: { maxOutputTokens: 512 },
};

describe("AnthropicMessagesAdapter", () => {
  it("requires an explicit max output token budget", () => {
    expect(() =>
      new AnthropicMessagesAdapter().prepare({
        model: "claude-test",
        messages: request.messages,
      }),
    ).toThrow(/maxOutputTokens/);
  });

  it("normalizes request id and content", () => {
    const adapter = new AnthropicMessagesAdapter();
    const normalized = adapter.parse(
      {
        url: "https://api.anthropic.com/v1/messages",
        method: "POST",
        status: 200,
        requestHeaders: {},
        responseHeaders: { "request-id": "req_ant_123" },
        requestBody: "{}",
        responseBody: JSON.stringify({
          id: "msg_123",
          type: "message",
          model: "claude-test-20260901",
          content: [{ type: "text", text: "hello" }],
          usage: { input_tokens: 2, output_tokens: 3 },
        }),
        startedAt: "2026-09-23T00:00:00.000Z",
        completedAt: "2026-09-23T00:00:01.000Z",
      },
      request,
    );

    expect(normalized.providerRequestId).toBe("req_ant_123");
    expect(normalized.providerResponseId).toBe("msg_123");
    expect(normalized.returnedModel).toBe("claude-test-20260901");
    expect(normalized.content[0]).toEqual({ type: "text", text: "hello" });
  });
});
