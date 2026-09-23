import type {
  ModelFamilyId,
  ModelId,
  ModelSnapshotId,
  ModelTrackId,
  ProviderId,
  SourceId,
} from "./ids.js";

export const modelStatuses = [
  "preview",
  "active",
  "deprecated",
  "retired",
  "archived",
] as const;
export type ModelStatus = (typeof modelStatuses)[number];

export const modelRelationTypes = [
  "successor_of",
  "replacement_for",
  "derived_from",
  "specialized_from",
  "same_generation_as",
] as const;
export type ModelRelationType = (typeof modelRelationTypes)[number];

export const providerPositions = [
  "flagship",
  "balanced",
  "fast",
  "economical",
  "specialist",
] as const;
export type ProviderPosition = (typeof providerPositions)[number];

export interface Provider {
  readonly id: ProviderId;
  readonly slug: string;
  readonly name: string;
  readonly homepage?: string;
}

export interface ModelFamily {
  readonly id: ModelFamilyId;
  readonly providerId: ProviderId;
  readonly slug: string;
  readonly displayName: string;
}

export interface ModelTrack {
  readonly id: ModelTrackId;
  readonly familyId: ModelFamilyId;
  readonly slug: string;
  readonly displayName: string;
  readonly trackType?: string;
}

export interface Model {
  readonly id: ModelId;
  readonly providerId: ProviderId;
  readonly familyId?: ModelFamilyId;
  readonly trackId?: ModelTrackId;
  readonly canonicalSlug: string;
  readonly marketingName: string;
  readonly releasedAt?: string;
  readonly retiredAt?: string;
  readonly status: ModelStatus;
}

export interface ModelSnapshot {
  readonly id: ModelSnapshotId;
  readonly modelId: ModelId;
  readonly providerSnapshotId: string;
  readonly validFrom?: string;
  readonly validTo?: string;
  readonly sourceId?: SourceId;
}

export interface ModelRelation {
  readonly fromModelId: ModelId;
  readonly toModelId: ModelId;
  readonly type: ModelRelationType;
  readonly sourceId?: SourceId;
  readonly confidence: number;
  readonly validFrom?: string;
}
