import type {
  TestCaseId,
  TestFamilyId,
  TestVariantId,
  TestVersionId,
} from "./ids.js";

export const artifactTypes = [
  "text",
  "svg",
  "html",
  "web_bundle",
  "image",
  "video",
  "repo",
  "agent_trace",
] as const;
export type ArtifactType = (typeof artifactTypes)[number];

export const testCaseTypes = [
  "icon",
  "public",
  "shadow",
  "fixture",
  "calibration",
] as const;
export type TestCaseType = (typeof testCaseTypes)[number];

export type TestCaseVisibility = "public" | "private";
export type TestCaseStatus = "active" | "retired";
export type TestVersionStatus = "draft" | "published" | "retired";

export interface TestFamily {
  readonly id: TestFamilyId;
  readonly slug: string;
  readonly name: string;
  readonly origin: "modelapse" | "external" | "hybrid";
}

export interface TestVariant {
  readonly id: TestVariantId;
  readonly familyId: TestFamilyId;
  readonly slug: string;
  readonly name: string;
  readonly category: string;
  readonly artifactType: ArtifactType;
}

export interface TestVersion {
  readonly id: TestVersionId;
  readonly variantId: TestVariantId;
  readonly version: string;
  readonly status: TestVersionStatus;
  readonly definitionHash: string;
  readonly publishedAt?: string;
}

export interface TestCase {
  readonly id: TestCaseId;
  readonly testVersionId: TestVersionId;
  readonly slug: string;
  readonly type: TestCaseType;
  readonly visibility: TestCaseVisibility;
  readonly status: TestCaseStatus;
  readonly activeFrom?: string;
  readonly activeTo?: string;
}

export interface EvaluatorRef {
  readonly id: string;
  readonly version: string;
  readonly kind: "deterministic" | "structural" | "visual" | "judge" | "hybrid";
}
