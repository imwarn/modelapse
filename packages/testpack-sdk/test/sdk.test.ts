import { describe, expect, it } from "vitest";
import { compileTestPack, toPublicTestPack } from "../src/index.js";

const clock = {
  apiVersion: "modelapse.dev/v1alpha1",
  kind: "TestPack",
  metadata: {
    id: "clock",
    version: "1.0.0",
    name: "Clock Test",
    origin: { type: "modelapse" },
  },
  spec: {
    artifactType: "svg",
    runtimePolicy: "svg-static",
    cases: [
      {
        id: "icon-8-47",
        type: "icon",
        visibility: "public",
        status: "active",
        prompt: "Create an SVG clock showing 8:47.",
      },
      {
        id: "shadow-active",
        type: "shadow",
        visibility: "private",
        status: "active",
        promptRef: "private://clock/shadow-generator@1",
      },
    ],
    evaluator: {
      id: "clock-geometry",
      version: "1.0.0",
      kind: "hybrid",
    },
  },
} as const;

describe("Test Pack SDK", () => {
  it("compiles a stable definition hash", () => {
    const a = compileTestPack(clock);
    const b = compileTestPack(clock);
    expect(a.definitionHash).toBe(b.definitionHash);
    expect(a.publicCases).toHaveLength(1);
    expect(a.privateCases).toHaveLength(1);
  });

  it("never exports a private shadow case to the public projection", () => {
    const compiled = compileTestPack(clock);
    const publicPack = toPublicTestPack(compiled.pack);
    expect(publicPack.spec.cases.map((c) => c.id)).toEqual(["icon-8-47"]);
  });
});
