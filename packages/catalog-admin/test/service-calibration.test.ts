import { describe, expect, it } from "vitest";
import {
  SERVICE_CALIBRATION_CASE_SLUG,
  SERVICE_CALIBRATION_PACK,
  SERVICE_CALIBRATION_PROMPT,
  serviceCalibrationDefinitionSha256,
} from "../src/index.js";

describe("canonical service-health calibration TestPack", () => {
  it("is a stable calibration case excluded from leaderboard semantics", () => {
    expect(SERVICE_CALIBRATION_PACK.pack.metadata.version).toBe("1.0.0");
    expect(SERVICE_CALIBRATION_PACK.pack.spec.cases).toHaveLength(1);
    expect(SERVICE_CALIBRATION_PACK.pack.spec.cases[0]).toMatchObject({
      id: SERVICE_CALIBRATION_CASE_SLUG,
      type: "calibration",
      visibility: "public",
      prompt: SERVICE_CALIBRATION_PROMPT,
      metadata: {
        expected: "modelapse-calibration-ok",
        assertion: "exact-text",
        leaderboardEligible: false,
      },
    });
    expect(serviceCalibrationDefinitionSha256()).toMatch(/^[0-9a-f]{64}$/);
  });
});
