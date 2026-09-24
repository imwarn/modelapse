import { compileTestPack } from "@modelapse/testpack-sdk";

export const DIRECT_SMOKE_PROMPT =
  "Return exactly the lowercase word modelapse and nothing else.";

export const DIRECT_SMOKE_FAMILY = {
  slug: "modelapse-direct-smoke",
  name: "Modelapse First-Party Direct Smoke",
  origin: "modelapse" as const,
};

export const DIRECT_SMOKE_VARIANT = {
  slug: "text-exact",
  name: "First-Party Direct Text",
  category: "smoke",
  artifactType: "text" as const,
};

export const DIRECT_SMOKE_VERSION = "1.0.0";
export const DIRECT_SMOKE_CASE_SLUG = "exact-modelapse";

export const DIRECT_SMOKE_PACK = compileTestPack({
  apiVersion: "modelapse.dev/v1alpha1",
  kind: "TestPack",
  metadata: {
    id: "first-party-direct-smoke",
    version: DIRECT_SMOKE_VERSION,
    name: "First-party direct provider smoke test",
    description:
      "Provider-neutral deterministic smoke case for verified first-party direct execution.",
    origin: {
      type: "modelapse",
      author: "Modelapse",
      license: null,
    },
    tags: ["smoke", "first-party-direct", "text"],
  },
  spec: {
    artifactType: "text",
    runtimePolicy: "first-party-direct",
    cases: [
      {
        id: DIRECT_SMOKE_CASE_SLUG,
        type: "icon",
        visibility: "public",
        status: "active",
        prompt: DIRECT_SMOKE_PROMPT,
      },
    ],
    evaluator: {
      id: "exact-text",
      version: "1.0.0",
      kind: "deterministic",
    },
  },
});

export function directSmokeDefinitionSha256(): string {
  return DIRECT_SMOKE_PACK.definitionHash.replace(/^sha256:/, "");
}
