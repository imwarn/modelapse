import { describe, expect, it } from "vitest";
import { DeepSeekResponsesAdapter } from "../src/index.js";

describe("DeepSeek Responses adapter", () => {
  it("prepares the first-party Responses API request without credentials", () => {
    const adapter = new DeepSeekResponsesAdapter();
    const prepared = adapter.prepare({
      model: "deepseek-flash",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "modelapse" }],
        },
      ],
      config: {
        maxOutputTokens: 32,
        reasoningEffort: "none",
      },
    });

    expect(prepared.url).toBe("https://api.deepseek.com/responses");
    expect(prepared.auth).toEqual({
      kind: "bearer",
      credentialName: "DEEPSEEK_API_KEY",
    });
    expect(prepared.body).not.toContain("DEEPSEEK_API_KEY");
    expect(JSON.parse(prepared.body ?? "")).toMatchObject({
      model: "deepseek-flash",
      input: [{ role: "user", content: "modelapse" }],
      max_output_tokens: 32,
      reasoning: { effort: "none" },
    });
  });
});
