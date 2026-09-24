import { describe, expect, it } from "vitest";
import { evaluateExactText } from "../src/index.js";

describe("exact-text evaluator", () => {
  it("compares normalized provider text without trimming", () => {
    const response = {
      requestedModel: "test",
      content: [{ type: "text" as const, text: "modelapse" }],
    };

    expect(
      evaluateExactText({ expected: "modelapse", response }),
    ).toEqual({
      expected: "modelapse",
      actual: "modelapse",
      exactMatch: true,
    });

    expect(
      evaluateExactText({
        expected: "modelapse",
        response: {
          ...response,
          content: [{ type: "text" as const, text: "modelapse\n" }],
        },
      }).exactMatch,
    ).toBe(false);
  });
});
