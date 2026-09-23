export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

export type ProviderId = Brand<string, "ProviderId">;
export type ModelFamilyId = Brand<string, "ModelFamilyId">;
export type ModelTrackId = Brand<string, "ModelTrackId">;
export type ModelId = Brand<string, "ModelId">;
export type ModelSnapshotId = Brand<string, "ModelSnapshotId">;
export type TestFamilyId = Brand<string, "TestFamilyId">;
export type TestVariantId = Brand<string, "TestVariantId">;
export type TestVersionId = Brand<string, "TestVersionId">;
export type TestCaseId = Brand<string, "TestCaseId">;
export type RunId = Brand<string, "RunId">;
export type ArtifactId = Brand<string, "ArtifactId">;
export type EvaluationId = Brand<string, "EvaluationId">;
export type SourceId = Brand<string, "SourceId">;

export type Sha256 = Brand<string, "Sha256">;

const SHA256_RE = /^[a-f0-9]{64}$/i;

export function asSha256(value: string): Sha256 {
  const normalized = value.startsWith("sha256:") ? value.slice(7) : value;
  if (!SHA256_RE.test(normalized)) {
    throw new Error(`Invalid SHA-256 digest: ${value}`);
  }
  return normalized.toLowerCase() as Sha256;
}
