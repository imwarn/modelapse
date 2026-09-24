import { compileTestPack } from "@modelapse/testpack-sdk";

export const OPENAI_SMOKE_PROMPT =
  "Return exactly the lowercase word modelapse and nothing else.";

export const OPENAI_SMOKE_FAMILY = {
  slug: "modelapse-smoke",
  name: "Modelapse Smoke",
  origin: "modelapse" as const,
};

export const OPENAI_SMOKE_VARIANT = {
  slug: "openai-direct-text",
  name: "OpenAI Direct Text",
  category: "smoke",
  artifactType: "text" as const,
};

export const OPENAI_SMOKE_VERSION = "1.0.0";
export const OPENAI_SMOKE_CASE_SLUG = "exact-modelapse";

export const OPENAI_SMOKE_PACK = compileTestPack({
  apiVersion: "modelapse.dev/v1alpha1",
  kind: "TestPack",
  metadata: {
    id: "openai-direct-smoke",
    version: OPENAI_SMOKE_VERSION,
    name: "OpenAI first-party direct smoke test",
    description:
      "Minimal deterministic production smoke case for the verified OpenAI direct control path.",
    origin: {
      type: "modelapse",
      author: "Modelapse",
      license: null,
    },
    tags: ["smoke", "openai", "direct"],
  },
  spec: {
    artifactType: "text",
    runtimePolicy: "first-party-direct",
    cases: [
      {
        id: OPENAI_SMOKE_CASE_SLUG,
        type: "icon",
        visibility: "public",
        status: "active",
        prompt: OPENAI_SMOKE_PROMPT,
      },
    ],
    evaluator: {
      id: "exact-text",
      version: "1.0.0",
      kind: "deterministic",
    },
  },
});

export function rawDefinitionSha256(): string {
  return OPENAI_SMOKE_PACK.definitionHash.replace(/^sha256:/, "");
}
