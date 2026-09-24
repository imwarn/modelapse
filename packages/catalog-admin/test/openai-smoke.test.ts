import { describe, expect, it } from "vitest";
import {
  OPENAI_SMOKE_CASE_SLUG,
  OPENAI_SMOKE_PACK,
  OPENAI_SMOKE_PROMPT,
  rawDefinitionSha256,
} from "../src/index.js";

describe("canonical OpenAI smoke TestPack", () => {
  it("has a stable publishable definition", () => {
    expect(OPENAI_SMOKE_PACK.pack.metadata.version).toBe("1.0.0");
    expect(OPENAI_SMOKE_PACK.pack.spec.cases).toHaveLength(1);
    expect(OPENAI_SMOKE_PACK.pack.spec.cases[0]?.id).toBe(
      OPENAI_SMOKE_CASE_SLUG,
    );
    expect(OPENAI_SMOKE_PACK.pack.spec.cases[0]?.prompt).toBe(
      OPENAI_SMOKE_PROMPT,
    );
    expect(rawDefinitionSha256()).toMatch(/^[0-9a-f]{64}$/);
  });
});
