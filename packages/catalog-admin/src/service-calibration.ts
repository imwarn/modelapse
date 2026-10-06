import { compileTestPack } from "@modelapse/testpack-sdk";

export const SERVICE_CALIBRATION_PROMPT =
  "Return exactly the lowercase text modelapse-calibration-ok and nothing else.";

export const SERVICE_CALIBRATION_EXPECTED = "modelapse-calibration-ok";

export const SERVICE_CALIBRATION_FAMILY = {
  slug: "modelapse-service-health",
  name: "Modelapse Service Health",
  origin: "modelapse" as const,
};

export const SERVICE_CALIBRATION_VARIANT = {
  slug: "exact-text-canary",
  name: "Exact Text Service Canary",
  category: "calibration",
  artifactType: "text" as const,
};

export const SERVICE_CALIBRATION_VERSION = "1.0.0";
export const SERVICE_CALIBRATION_CASE_SLUG = "service-health-exact";

export const SERVICE_CALIBRATION_PACK = compileTestPack({
  apiVersion: "modelapse.dev/v1alpha1",
  kind: "TestPack",
  metadata: {
    id: "modelapse-service-health",
    version: SERVICE_CALIBRATION_VERSION,
    name: "Modelapse service-health calibration",
    description:
      "Provider-neutral deterministic canary. Results are service-health evidence and are not leaderboard scores.",
    origin: {
      type: "modelapse",
      author: "Modelapse",
      license: null,
    },
    tags: ["calibration", "service-health", "first-party-direct"],
  },
  spec: {
    artifactType: "text",
    runtimePolicy: "first-party-direct",
    cases: [
      {
        id: SERVICE_CALIBRATION_CASE_SLUG,
        type: "calibration",
        visibility: "public",
        status: "active",
        prompt: SERVICE_CALIBRATION_PROMPT,
        metadata: {
          expected: SERVICE_CALIBRATION_EXPECTED,
          assertion: "exact-text",
          leaderboardEligible: false,
        },
      },
    ],
    evaluator: {
      id: "exact-text",
      version: "1.0.0",
      kind: "deterministic",
    },
  },
});

export function serviceCalibrationDefinitionSha256(): string {
  return SERVICE_CALIBRATION_PACK.definitionHash.replace(/^sha256:/, "");
}
