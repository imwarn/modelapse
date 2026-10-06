import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RunnableModelTestabilityObservation {
  readonly id: string;
  readonly scope: "provider" | "model";
  readonly accessState: "available" | "restricted" | "unavailable" | "unknown";
  readonly registrationRequirement:
    | "open_signup"
    | "restricted_signup"
    | "invite_only"
    | "enterprise_only"
    | "unknown";
  readonly billingRequirement:
    | "free"
    | "paid_account"
    | "prepaid_credit"
    | "subscription"
    | "enterprise_contract"
    | "unknown";
  readonly regionPolicy: "unrestricted" | "restricted" | "unknown";
  readonly accountTier: string | null;
  readonly serviceTier: string | null;
  readonly serviceAssurance:
    | "documented_default"
    | "documented_variant"
    | "operator_uncertain"
    | "unknown";
  readonly observedAt: string;
  readonly sourceId: string;
}

export interface RunnableModel {
  readonly id: string;
  readonly providerId: string;
  readonly provider: "openai" | "deepseek";
  readonly canonicalSlug: string;
  readonly marketingName: string;
  readonly status: "preview" | "active";
  readonly apiModelId: string;
  readonly snapshotId: string | null;
  readonly endpointHostname: string;
  readonly testability: {
    readonly providerPolicy: RunnableModelTestabilityObservation | null;
    readonly runnerAccess: RunnableModelTestabilityObservation | null;
  };
}

export interface RunnableTest {
  readonly testCaseId: string;
  readonly familySlug: string;
  readonly familyName: string;
  readonly variantSlug: string;
  readonly variantName: string;
  readonly version: string;
  readonly caseSlug: string;
  readonly caseType: string;
  readonly visibility: "public" | "private";
  readonly artifactType: string;
  readonly evaluator: {
    readonly slug: string;
    readonly version: string;
    readonly kind: string;
  };
}

export interface ControlCatalog {
  readonly models: readonly RunnableModel[];
  readonly tests: readonly RunnableTest[];
}

export interface ArchiveModel {
  readonly id: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly canonicalSlug: string;
  readonly marketingName: string;
  readonly status: string;
  readonly runCount: number;
  readonly latestRunAt: string | null;
}

export interface ArchiveTest {
  readonly testCaseId: string;
  readonly familySlug: string;
  readonly familyName: string;
  readonly variantSlug: string;
  readonly variantName: string;
  readonly category: string;
  readonly artifactType: string;
  readonly version: string;
  readonly caseSlug: string;
  readonly evaluator: {
    readonly slug: string;
    readonly version: string;
    readonly kind: string;
  } | null;
  readonly runCount: number;
}

export interface ArchiveSource {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly author: string | null;
  readonly publishedAt: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export interface ArchiveCatalogIdentityState {
  readonly model: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
  } | null;
  readonly snapshot: {
    readonly id: string;
    readonly providerSnapshotId: string;
  } | null;
  readonly endpoint: {
    readonly id: string;
    readonly path: string;
    readonly baseUrl: string;
    readonly hostname: string;
  } | null;
  readonly apiModelId: string | null;
}

export interface ArchiveCatalogChange {
  readonly id: string;
  readonly changeType: "alias_target_changed" | "execution_binding_changed";
  readonly occurredAt: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly alias: {
    readonly id: string;
    readonly value: string;
  } | null;
  readonly changedFields: readonly string[];
  readonly previous: ArchiveCatalogIdentityState;
  readonly current: ArchiveCatalogIdentityState;
  readonly previousRecordId: string;
  readonly currentRecordId: string;
  readonly previousSource: ArchiveSource | null;
  readonly currentSource: ArchiveSource;
}

export interface ArchiveModelAliasResolution {
  readonly id: string;
  readonly alias: {
    readonly id: string;
    readonly value: string;
  };
  readonly observedAt: string;
  readonly sourceType: string;
  readonly confidence: number;
  readonly resolvedModelId: string | null;
  readonly resolvedSnapshot: {
    readonly id: string;
    readonly providerSnapshotId: string;
  } | null;
  readonly source: ArchiveSource | null;
}

export interface ArchiveModelExecutionBinding {
  readonly id: string;
  readonly apiModelId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly createdAt: string;
  readonly endpoint: {
    readonly id: string;
    readonly path: string;
    readonly baseUrl: string;
    readonly hostname: string;
    readonly source: ArchiveSource | null;
  };
  readonly snapshot: {
    readonly id: string;
    readonly providerSnapshotId: string;
  } | null;
  readonly source: ArchiveSource;
}

export interface ArchiveIdentityTimelineEvent {
  readonly id: string;
  readonly kind:
    | "canonical_source"
    | "alias_resolution"
    | "binding_started"
    | "binding_ended"
    | "snapshot_started"
    | "snapshot_ended";
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
  readonly source: ArchiveSource | null;
  readonly aliasId: string | null;
  readonly bindingId: string | null;
  readonly snapshotId: string | null;
}

export interface ArchiveTestVersionHistory {
  readonly id: string;
  readonly version: string;
  readonly status: string;
  readonly definitionSha256: string;
  readonly license: string | null;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly source: ArchiveSource | null;
  readonly evaluator: {
    readonly slug: string;
    readonly version: string;
    readonly kind: string;
  } | null;
  readonly publicCaseCount: number;
  readonly linkedTestCaseId: string | null;
}

export interface ArchiveModelSnapshot {
  readonly id: string;
  readonly providerSnapshotId: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly sourceId: string | null;
  readonly source: ArchiveSource | null;
}

export interface ArchiveModelRelation {
  readonly id: string;
  readonly direction: "outgoing" | "incoming";
  readonly relationType: string;
  readonly relatedModel: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly providerSlug: string;
  };
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly sourceId: string | null;
  readonly source: ArchiveSource | null;
  readonly confidence: number;
}

export interface ArchiveTimelineEvent {
  readonly id: string;
  readonly kind:
    | "model_released"
    | "model_retired"
    | "snapshot_started"
    | "snapshot_ended"
    | "relation"
    | "run";
  readonly occurredAt: string;
  readonly title: string;
  readonly description: string;
  readonly runId: string | null;
  readonly testCaseId: string | null;
  readonly snapshotId: string | null;
  readonly relatedModelId: string | null;
}

export interface ArchiveModelDetail extends ArchiveModel {
  readonly family: {
    readonly id: string;
    readonly slug: string;
    readonly displayName: string;
  } | null;
  readonly track: {
    readonly id: string;
    readonly slug: string;
    readonly displayName: string;
    readonly trackType: string | null;
  } | null;
  readonly releasedAt: string | null;
  readonly retiredAt: string | null;
  readonly canonicalSourceId: string | null;
  readonly canonicalSource: ArchiveSource | null;
  readonly snapshots: readonly ArchiveModelSnapshot[];
  readonly relations: readonly ArchiveModelRelation[];
  readonly aliasResolutions: readonly ArchiveModelAliasResolution[];
  readonly executionBindings: readonly ArchiveModelExecutionBinding[];
  readonly identityTimeline: readonly ArchiveIdentityTimelineEvent[];
  readonly identityDrift: readonly ArchiveCatalogChange[];
  readonly testCoverage: readonly {
    readonly testCaseId: string;
    readonly familySlug: string;
    readonly familyName: string;
    readonly version: string;
    readonly caseSlug: string;
    readonly runCount: number;
    readonly latestRunAt: string | null;
  }[];
  readonly recentRuns: readonly ArchiveRun[];
  readonly timeline: readonly ArchiveTimelineEvent[];
}

export interface ArchiveTestDetail extends ArchiveTest {
  readonly origin: string;
  readonly canonicalSourceId: string | null;
  readonly canonicalSource: ArchiveSource | null;
  readonly versionSource: ArchiveSource | null;
  readonly versionHistory: readonly ArchiveTestVersionHistory[];
  readonly versionStatus: string;
  readonly definitionSha256: string;
  readonly license: string | null;
  readonly publishedAt: string | null;
  readonly versionCreatedAt: string;
  readonly caseType: string;
  readonly caseStatus: string;
  readonly activeFrom: string | null;
  readonly activeTo: string | null;
  readonly promptSha256: string;
  readonly fixtureManifestSha256: string | null;
  readonly evaluatorDefinitionSha256: string | null;
  readonly modelCoverage: readonly {
    readonly modelId: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly providerSlug: string;
    readonly runCount: number;
    readonly latestRunAt: string | null;
  }[];
  readonly recentRuns: readonly ArchiveRun[];
}

export interface ArchiveComparabilityPolicy {
  readonly id: string;
  readonly version: string;
  readonly minimumEvidenceLevel: "E0" | "E1" | "E2" | "E3" | "E4" | "E5";
  readonly requireSameExecutionPath: boolean;
  readonly requireRegion: boolean;
  readonly requireAccountTier: boolean;
  readonly requireServiceTier: boolean;
  readonly requireDocumentedServiceAssurance: boolean;
  readonly rejectQualificationCaveats: boolean;
  readonly requireRecentCalibration: boolean;
  readonly rejectRepeatedCalibrationAnomaly: boolean;
  readonly calibrationMaxAgeHours: number;
  readonly defaultMinRepeatCount: number;
  readonly unstableMinRepeatCount: number;
  readonly actor: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface ArchiveRunComparability {
  readonly status: "eligible" | "ineligible" | "unknown";
  readonly reasons: readonly string[];
  readonly repeatCount: number;
  readonly requiredRepeatCount: number;
  readonly calibration: {
    readonly runId: string;
    readonly policyVersion: string;
    readonly status: "pass" | "anomaly" | "unknown";
    readonly anomalyStreak: number;
    readonly repeatedAnomaly: boolean;
    readonly repeatRecommended: boolean;
    readonly completedAt: string;
    readonly ageHours: number;
  } | null;
}

export interface ArchiveComparison {
  readonly test: ArchiveTest;
  readonly policy: ArchiveComparabilityPolicy;
  readonly comparabilitySet: {
    readonly status: "matched" | "mismatched" | "unknown";
    readonly key: string | null;
    readonly reasons: readonly string[];
  };
  readonly rows: readonly {
    readonly model: ArchiveModel;
    readonly latestRun: ArchiveRun | null;
    readonly comparability: ArchiveRunComparability | null;
  }[];
}

export interface ArchiveCatalog {
  readonly models: readonly ArchiveModel[];
  readonly tests: readonly ArchiveTest[];
}

export interface ArchiveRunExecutionQualification {
  readonly selectedAt: string;
  readonly executionEnvironment: {
    readonly id: string;
    readonly slug: string;
    readonly capabilityEventId: string | null;
  } | null;
  readonly executionRegion: string | null;
  readonly accountTier: string | null;
  readonly serviceTier: string | null;
  readonly requestedServiceTier: string | null;
  readonly returnedServiceTier: string | null;
  readonly serviceAssurance: string;
  readonly providerPolicyObservation: {
    readonly id: string;
    readonly sourceId: string;
    readonly accessState: string;
  } | null;
  readonly runnerAccessObservation: {
    readonly id: string;
    readonly sourceId: string;
    readonly accessState: string;
  } | null;
  readonly caveats: readonly string[];
  readonly contextKey: string | null;
}

export interface ArchiveRunCost {
  readonly selectedAt: string;
  readonly pricingObservation: {
    readonly id: string;
    readonly sourceId: string;
  } | null;
  readonly pricing: {
    readonly currency: string;
    readonly inputPerMillion: string | null;
    readonly outputPerMillion: string | null;
    readonly perRequest: string | null;
  } | null;
  readonly usage: {
    readonly inputTokens: string | null;
    readonly outputTokens: string | null;
    readonly totalTokens: string | null;
    readonly requestCount: number;
  } | null;
  readonly estimatedNativeCost: string | null;
  readonly caveats: readonly string[];
}

export interface ArchiveRun {
  readonly id: string;
  readonly status: string;
  readonly model: {
    readonly id: string | null;
    readonly canonicalSlug: string | null;
    readonly marketingName: string | null;
  };
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly test: {
    readonly testCaseId: string;
    readonly familySlug: string;
    readonly familyName: string;
    readonly variantSlug: string;
    readonly variantName: string;
    readonly version: string;
    readonly caseSlug: string;
  };
  readonly requestedModel: string;
  readonly returnedModel: string | null;
  readonly executionPath: string;
  readonly evidenceLevel: string | null;
  readonly executionQualification: ArchiveRunExecutionQualification | null;
  readonly cost: ArchiveRunCost | null;
  readonly evaluation: {
    readonly id: string;
    readonly status: string;
    readonly evaluatorSlug: string;
    readonly evaluatorVersion: string;
    readonly evaluatorKind: string;
    readonly definitionSha256: string;
    readonly rawResultSha256: string | null;
    readonly exactMatch: boolean | null;
  } | null;
  readonly runnerBuild: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly sealedAt: string | null;
}

export interface ArchiveBlob {
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly visibility: string;
}

export interface ArchiveRunEvidence {
  readonly id: string;
  readonly level: string;
  readonly executionPath: string;
  readonly collector: string;
  readonly sourceId: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly attestation: {
    readonly id: string;
    readonly keyId: string;
    readonly algorithm: string;
    readonly payloadSha256: string;
    readonly signature: string;
    readonly keyValidFrom: string;
    readonly keyValidTo: string | null;
    readonly createdAt: string;
  } | null;
}

export interface ArchiveRunRelationEdge {
  readonly fromRunId: string;
  readonly toRunId: string;
  readonly relationType: string;
  readonly createdAt: string;
}

export interface ArchiveRunRelation {
  readonly direction: "outgoing" | "incoming";
  readonly relationType: string;
  readonly relatedRunId: string;
  readonly createdAt: string;
}

export interface ArchiveRunDetail extends ArchiveRun {
  readonly configJson: string | null;
  readonly requestBlob: ArchiveBlob | null;
  readonly responseBlob: ArchiveBlob | null;
  readonly responseHeadersSha256: string | null;
  readonly usageJson: string | null;
  readonly timingJson: string | null;
  readonly evidence: readonly ArchiveRunEvidence[];
  readonly relations: readonly ArchiveRunRelation[];
}

interface ArchiveRunDetailWire extends ArchiveRun {
  readonly config: unknown;
  readonly requestBlob: ArchiveBlob | null;
  readonly responseBlob: ArchiveBlob | null;
  readonly responseHeadersSha256: string | null;
  readonly usage: unknown;
  readonly timing: unknown;
  readonly evidence: readonly ArchiveRunEvidence[];
  readonly relations: readonly ArchiveRunRelation[];
}

export interface ArchiveRunHistory {
  readonly model: ArchiveModel;
  readonly test: ArchiveTest;
  readonly runs: readonly ArchiveRun[];
  readonly relations: readonly ArchiveRunRelationEdge[];
}

export interface ArchiveTemporalComparison {
  readonly test: ArchiveTest;
  readonly rows: readonly {
    readonly model: ArchiveModel;
    readonly runs: readonly ArchiveRun[];
    readonly relations: readonly ArchiveRunRelationEdge[];
  }[];
}

export type CatalogDiscoveryStatus =
  | "discovered"
  | "matched"
  | "ignored"
  | "promotion_ready";

export interface CatalogDiscoveryCandidate {
  readonly id: string;
  readonly provider: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  };
  readonly remoteModelId: string;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly latestProviderSnapshotId: string | null;
  readonly observationCount: number;
  readonly status: CatalogDiscoveryStatus;
  readonly resolvedModel: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
  } | null;
  readonly resolvedAt: string | null;
  readonly promotionPolicy: {
    readonly version: string;
    readonly eligible: boolean;
    readonly blockers: readonly string[];
    readonly evidence: {
      readonly sourceRecordId: string;
      readonly sourceType: string;
      readonly sourceUrl: string | null;
      readonly sourceTitle: string | null;
      readonly contentSha256: string | null;
      readonly sourceRetrievedAt: string;
      readonly observationCount: number;
    };
  };
  readonly lastSource: ArchiveSource;
  readonly promotion: {
    readonly id: string;
    readonly promotedAt: string;
    readonly actor: string;
    readonly modelId: string;
    readonly policyVersion: string;
  } | null;
  readonly latestDecision: {
    readonly id: string;
    readonly action: "match_existing" | "ignore" | "mark_promotion_ready" | "reopen";
    readonly decidedAt: string;
    readonly actor: string;
    readonly note: string | null;
  } | null;
}

export type CatalogDriftReviewStatus = "open" | "acknowledged" | "resolved";
export interface CatalogDriftReviewItem {
  readonly eventId: string;
  readonly changeType: string;
  readonly occurredAt: string;
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly model: { readonly id: string; readonly canonicalSlug: string; readonly marketingName: string } | null;
  readonly alias: string | null;
  readonly previousApiModelId: string | null;
  readonly currentApiModelId: string | null;
  readonly changedFields: readonly string[];
  readonly previousSource: { readonly id: string; readonly url: string | null; readonly title: string | null } | null;
  readonly currentSource: { readonly id: string; readonly url: string | null; readonly title: string | null } | null;
  readonly review: {
    readonly status: CatalogDriftReviewStatus;
    readonly acknowledgedAt: string | null;
    readonly resolvedAt: string | null;
    readonly latestDecision: { readonly id: string; readonly action: "acknowledge" | "resolve" | "reopen"; readonly actor: string; readonly note: string | null; readonly decidedAt: string } | null;
  };
}

export interface CatalogIdentityCaseSource {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export interface CatalogIdentityCase {
  readonly model: {
    readonly id: string;
    readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly status: string;
  };
  readonly candidates: readonly {
    readonly id: string;
    readonly remoteModelId: string;
    readonly status: string;
    readonly firstSeenAt: string;
    readonly lastSeenAt: string;
    readonly observationCount: number;
    readonly resolvedAt: string | null;
    readonly observations: readonly {
      readonly id: string;
      readonly observedAt: string;
      readonly providerSnapshotId: string | null;
      readonly source: CatalogIdentityCaseSource;
    }[];
    readonly decisions: readonly {
      readonly id: string;
      readonly action: string;
      readonly decidedAt: string;
      readonly actor: string;
      readonly note: string | null;
      readonly resolvedModelId: string | null;
    }[];
    readonly promotion: {
      readonly id: string;
      readonly promotedAt: string;
      readonly actor: string;
      readonly canonicalSlug: string;
      readonly marketingName: string;
      readonly modelStatus: string;
      readonly policyVersion: string;
      readonly evidenceJson: string;
      readonly source: CatalogIdentityCaseSource;
    } | null;
  }[];
  readonly drift: readonly {
    readonly eventId: string;
    readonly changeType: string;
    readonly occurredAt: string;
    readonly changedFields: readonly string[];
    readonly previousApiModelId: string | null;
    readonly currentApiModelId: string | null;
    readonly previousSource: CatalogIdentityCaseSource | null;
    readonly currentSource: CatalogIdentityCaseSource;
    readonly review: {
      readonly status: CatalogDriftReviewStatus;
      readonly acknowledgedAt: string | null;
      readonly resolvedAt: string | null;
      readonly decisions: readonly {
        readonly id: string;
        readonly action: "acknowledge" | "resolve" | "reopen";
        readonly actor: string;
        readonly note: string | null;
        readonly decidedAt: string;
      }[];
    };
  }[];
  readonly timeline: readonly {
    readonly id: string;
    readonly kind:
      | "discovery_observation"
      | "reconciliation"
      | "promotion"
      | "identity_drift"
      | "drift_review";
    readonly occurredAt: string;
    readonly title: string;
    readonly description: string;
    readonly candidateId: string | null;
    readonly driftEventId: string | null;
    readonly actor: string | null;
    readonly note: string | null;
    readonly source: CatalogIdentityCaseSource | null;
  }[];
}

export type CatalogIntegrityCategory =
  | "collection_failed"
  | "collection_partial"
  | "collection_stale"
  | "discovery_unresolved"
  | "promotion_ready"
  | "promotion_blocked"
  | "drift_open"
  | "drift_acknowledged"
  | "provenance_incomplete";

export interface CatalogIntegrityDashboard {
  readonly generatedAt: string;
  readonly summary: {
    readonly total: number;
    readonly counts: Readonly<Record<CatalogIntegrityCategory, number>>;
  };
  readonly observerSources: readonly {
    readonly id: string;
    readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
    readonly sourceKey: string;
    readonly sourceKind: string;
    readonly url: string;
    readonly title: string;
    readonly enabled: boolean;
    readonly intervalSeconds: number;
    readonly lastAttemptedAt: string | null;
    readonly lastSucceededAt: string | null;
    readonly nextRunAt: string;
    readonly health: "disabled" | "healthy" | "never_collected" | "failed" | "partial" | "stale";
    readonly attentionCategory: "collection_failed" | "collection_partial" | "collection_stale" | null;
    readonly latestRun: {
      readonly id: string;
      readonly status: string;
      readonly startedAt: string;
      readonly completedAt: string | null;
      readonly httpStatus: number | null;
      readonly itemCount: number | null;
      readonly observationsEmitted: number;
    } | null;
  }[];
  readonly discovery: readonly {
    readonly candidateId: string;
    readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
    readonly remoteModelId: string;
    readonly status: CatalogDiscoveryStatus;
    readonly firstSeenAt: string;
    readonly lastSeenAt: string;
    readonly observationCount: number;
    readonly latestProviderSnapshotId: string | null;
    readonly attentionCategory: "discovery_unresolved" | "promotion_ready" | "promotion_blocked";
    readonly promotionPolicy: {
      readonly version: string;
      readonly eligible: boolean;
      readonly blockers: readonly string[];
    };
    readonly latestFirstPartySource: {
      readonly id: string;
      readonly sourceType: string;
      readonly url: string | null;
      readonly title: string | null;
      readonly retrievedAt: string;
      readonly contentSha256: string | null;
    };
  }[];
  readonly drift: readonly {
    readonly eventId: string;
    readonly attentionCategory: "drift_open" | "drift_acknowledged";
    readonly changeType: string;
    readonly occurredAt: string;
    readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
    readonly model: { readonly id: string; readonly canonicalSlug: string; readonly marketingName: string } | null;
    readonly alias: string | null;
    readonly previousApiModelId: string | null;
    readonly currentApiModelId: string | null;
    readonly changedFields: readonly string[];
    readonly evidenceSource: { readonly id: string; readonly url: string | null; readonly title: string | null } | null;
    readonly reviewStatus: "open" | "acknowledged";
  }[];
  readonly provenance: readonly {
    readonly model: {
      readonly id: string;
      readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
      readonly canonicalSlug: string;
      readonly marketingName: string;
      readonly status: string;
    };
    readonly attentionCategory: "provenance_incomplete";
    readonly reasons: readonly string[];
    readonly canonicalSource: {
      readonly id: string;
      readonly sourceType: string;
      readonly url: string | null;
      readonly title: string | null;
      readonly retrievedAt: string;
      readonly contentSha256: string | null;
    } | null;
    readonly currentBinding: {
      readonly id: string;
      readonly apiModelId: string;
      readonly endpointHostname: string;
      readonly source: {
        readonly id: string;
        readonly sourceType: string;
        readonly url: string | null;
        readonly title: string | null;
        readonly retrievedAt: string;
        readonly contentSha256: string | null;
      };
    } | null;
    readonly currentBindingCount: number;
    readonly promotionAudit: {
      readonly id: string;
      readonly candidateId: string;
      readonly promotedAt: string;
      readonly policyVersion: string;
      readonly sourceRecordId: string;
    } | null;
  }[];
}

export type CatalogCoverageDisposition =
  | "canonical_observed"
  | "candidate_discovered"
  | "candidate_promotion_ready"
  | "candidate_ignored"
  | "candidate_matched";

export interface CatalogCoverageSourceRecord {
  readonly id: string;
  readonly sourceType: string;
  readonly url: string | null;
  readonly title: string | null;
  readonly retrievedAt: string;
  readonly contentSha256: string | null;
}

export interface CatalogProviderCoverageSummary {
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly generatedAt: string;
  readonly latestEvidenceAt: string | null;
  readonly summary: CatalogProviderCoverage["summary"];
}

export interface CatalogProviderCoverage {
  readonly generatedAt: string;
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly summary: {
    readonly modelListSources: number;
    readonly sourcesWithEvidence: number;
    readonly sourceItemCount: number;
    readonly uniqueProjectedRemoteIds: number;
    readonly canonicalObserved: number;
    readonly candidateDiscovered: number;
    readonly candidatePromotionReady: number;
    readonly candidateIgnored: number;
    readonly candidateMatched: number;
    readonly unprojectedSourceItems: number;
    readonly currentBindingsNotObserved: number;
  };
  readonly sources: readonly {
    readonly id: string;
    readonly sourceKey: string;
    readonly url: string;
    readonly title: string;
    readonly enabled: boolean;
    readonly latestAttempt: {
      readonly runId: string;
      readonly status: string;
      readonly startedAt: string;
      readonly completedAt: string | null;
    } | null;
    readonly latestEvidence: {
      readonly runId: string;
      readonly status: "succeeded" | "partial";
      readonly startedAt: string;
      readonly completedAt: string | null;
      readonly itemCount: number;
      readonly observationsEmitted: number;
      readonly source: CatalogCoverageSourceRecord;
      readonly projectedItemCount: number;
      readonly unprojectedItemCount: number;
    } | null;
  }[];
  readonly remoteItems: readonly {
    readonly remoteModelId: string;
    readonly disposition: CatalogCoverageDisposition;
    readonly observations: readonly {
      readonly observerSourceId: string;
      readonly runId: string;
      readonly sourceRecordId: string;
      readonly observedAt: string;
      readonly providerSnapshotId: string | null;
    }[];
    readonly canonicalModel: {
      readonly id: string;
      readonly canonicalSlug: string;
      readonly marketingName: string;
    } | null;
    readonly candidate: {
      readonly id: string;
      readonly status: "discovered" | "promotion_ready" | "ignored" | "matched";
      readonly observationCount: number;
      readonly resolvedModel: {
        readonly id: string;
        readonly canonicalSlug: string;
        readonly marketingName: string;
      } | null;
    } | null;
  }[];
  readonly currentBindingsNotObserved: readonly {
    readonly bindingId: string;
    readonly apiModelId: string;
    readonly model: {
      readonly id: string;
      readonly canonicalSlug: string;
      readonly marketingName: string;
    };
    readonly endpointHostname: string;
    readonly source: CatalogCoverageSourceRecord;
    readonly interpretation: "not_observed_in_latest_model_list_evidence";
  }[];
}

export type CatalogPresenceEventKind =
  | "appeared_in_complete_snapshot"
  | "not_observed_in_complete_snapshot"
  | "reobserved_in_complete_snapshot";

export interface CatalogPresenceHistory {
  readonly generatedAt: string;
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly summary: {
    readonly modelListSources: number;
    readonly evidenceRuns: number;
    readonly completeProjectionRuns: number;
    readonly incompleteProjectionRuns: number;
    readonly appearanceEvents: number;
    readonly absenceEvents: number;
    readonly reappearanceEvents: number;
    readonly latestCompleteAt: string | null;
  };
  readonly sources: readonly {
    readonly id: string;
    readonly sourceKey: string;
    readonly title: string;
    readonly url: string;
    readonly enabled: boolean;
    readonly evidenceRuns: number;
    readonly completeProjectionRuns: number;
    readonly latestCompleteAt: string | null;
  }[];
  readonly runs: readonly {
    readonly runId: string;
    readonly observerSourceId: string;
    readonly sourceKey: string;
    readonly sourceTitle: string;
    readonly startedAt: string;
    readonly completedAt: string | null;
    readonly status: "succeeded" | "partial";
    readonly itemCount: number;
    readonly projectedItemCount: number;
    readonly completeProjection: boolean;
    readonly source: {
      readonly id: string;
      readonly sourceType: string;
      readonly url: string | null;
      readonly title: string | null;
      readonly retrievedAt: string;
      readonly contentSha256: string | null;
    };
  }[];
  readonly events: readonly {
    readonly id: string;
    readonly kind: CatalogPresenceEventKind;
    readonly remoteModelId: string;
    readonly observerSourceId: string;
    readonly sourceKey: string;
    readonly occurredAt: string;
    readonly runId: string;
    readonly previousCompleteRunId: string | null;
    readonly currentContext: {
      readonly canonicalModel: {
        readonly id: string;
        readonly canonicalSlug: string;
        readonly marketingName: string;
      } | null;
      readonly candidate: {
        readonly id: string;
        readonly status: "discovered" | "matched" | "ignored" | "promotion_ready";
        readonly resolvedModelId: string | null;
      } | null;
    };
    readonly interpretation:
      | "observed_in_complete_model_list_evidence"
      | "not_observed_in_complete_model_list_evidence"
      | "observed_again_after_complete_snapshot_absence";
  }[];
}

export type CatalogPresenceReviewStatus = "open" | "acknowledged" | "resolved";
export type CatalogPresenceReviewAction = "acknowledge" | "resolve" | "reopen";

export interface CatalogPresenceReviewItem {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly interpretation: "not_observed_in_complete_model_list_evidence";
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly observerSource: {
    readonly id: string;
    readonly sourceKey: string;
    readonly title: string;
    readonly url: string;
  };
  readonly runId: string;
  readonly previousCompleteRunId: string | null;
  readonly remoteModelId: string;
  readonly currentContext: {
    readonly canonicalModel: {
      readonly id: string;
      readonly canonicalSlug: string;
      readonly marketingName: string;
    } | null;
    readonly candidate: {
      readonly id: string;
      readonly status: "discovered" | "matched" | "ignored" | "promotion_ready";
      readonly resolvedModelId: string | null;
    } | null;
  };
  readonly review: {
    readonly status: CatalogPresenceReviewStatus;
    readonly acknowledgedAt: string | null;
    readonly resolvedAt: string | null;
    readonly latestDecision: {
      readonly id: string;
      readonly action: CatalogPresenceReviewAction;
      readonly actor: string;
      readonly note: string | null;
      readonly decidedAt: string;
    } | null;
  };
}

export type CatalogRemoteIdCaseTimelineKind =
  | "discovery_observation"
  | "canonical_observation"
  | "presence_appeared"
  | "presence_not_observed"
  | "presence_reobserved"
  | "reconciliation"
  | "promotion"
  | "presence_review";

export interface CatalogRemoteIdCase {
  readonly generatedAt: string;
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly remoteModelId: string;
  readonly summary: {
    readonly observationEvents: number;
    readonly presenceTransitions: number;
    readonly reconciliationEvents: number;
    readonly reviewDecisions: number;
    readonly firstObservedAt: string | null;
    readonly lastObservedAt: string | null;
    readonly openPresenceReviews: number;
    readonly acknowledgedPresenceReviews: number;
    readonly resolvedPresenceReviews: number;
  };
  readonly current: {
    readonly candidate: {
      readonly id: string;
      readonly status: "discovered" | "matched" | "ignored" | "promotion_ready";
      readonly firstSeenAt: string;
      readonly lastSeenAt: string;
      readonly observationCount: number;
      readonly resolvedAt: string | null;
      readonly resolvedModel: {
        readonly id: string;
        readonly canonicalSlug: string;
        readonly marketingName: string;
      } | null;
    } | null;
    readonly canonicalModel: {
      readonly id: string;
      readonly canonicalSlug: string;
      readonly marketingName: string;
      readonly status: string;
    } | null;
    readonly promotion: {
      readonly id: string;
      readonly modelId: string;
      readonly promotedAt: string;
      readonly actor: string;
      readonly policyVersion: string;
      readonly source: {
        readonly id: string;
        readonly sourceType: string;
        readonly url: string | null;
        readonly title: string | null;
        readonly retrievedAt: string;
        readonly contentSha256: string | null;
      };
    } | null;
  };
  readonly presenceReviews: readonly {
    readonly eventId: string;
    readonly occurredAt: string;
    readonly status: CatalogPresenceReviewStatus;
    readonly acknowledgedAt: string | null;
    readonly resolvedAt: string | null;
    readonly runId: string;
    readonly previousCompleteRunId: string | null;
    readonly observerSourceId: string;
    readonly decisions: readonly {
      readonly id: string;
      readonly action: CatalogPresenceReviewAction;
      readonly actor: string;
      readonly note: string | null;
      readonly decidedAt: string;
    }[];
  }[];
  readonly timeline: readonly {
    readonly id: string;
    readonly kind: CatalogRemoteIdCaseTimelineKind;
    readonly occurredAt: string;
    readonly title: string;
    readonly description: string;
    readonly actor: string | null;
    readonly note: string | null;
    readonly source: {
      readonly id: string;
      readonly sourceType: string;
      readonly url: string | null;
      readonly title: string | null;
      readonly retrievedAt: string;
      readonly contentSha256: string | null;
    } | null;
    readonly runId: string | null;
    readonly presenceEventId: string | null;
    readonly modelId: string | null;
  }[];
}

export type ProviderTestabilitySubjectKind = "provider_policy" | "runner_access";
export type ProviderTestabilityAccessState =
  | "available"
  | "restricted"
  | "unavailable"
  | "unknown";
export type ProviderTestabilityServiceAssurance =
  | "documented_default"
  | "documented_variant"
  | "operator_uncertain"
  | "unknown";

export interface ProviderTestabilityObservation {
  readonly id: string;
  readonly providerId: string;
  readonly model: {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
  } | null;
  readonly executionPath: string;
  readonly subjectKind: ProviderTestabilitySubjectKind;
  readonly accessState: ProviderTestabilityAccessState;
  readonly registrationRequirement: string;
  readonly billingRequirement: string;
  readonly regionPolicy: string;
  readonly allowedRegions: readonly string[];
  readonly blockedRegions: readonly string[];
  readonly accountTier: string | null;
  readonly serviceTier: string | null;
  readonly serviceAssurance: ProviderTestabilityServiceAssurance;
  readonly pricing: {
    readonly currency: string;
    readonly inputPerMillion: string | null;
    readonly outputPerMillion: string | null;
    readonly perRequest: string | null;
  } | null;
  readonly source: {
    readonly id: string;
    readonly sourceType: string;
    readonly url: string | null;
    readonly title: string | null;
    readonly retrievedAt: string;
    readonly contentSha256: string | null;
  };
  readonly observedAt: string;
  readonly actor: string;
  readonly note: string | null;
  readonly createdAt: string;
}

export interface ProviderTestabilityProviderSummary {
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly modelCount: number;
  readonly currentObservationCount: number;
  readonly providerPolicyCount: number;
  readonly runnerAccessCount: number;
  readonly restrictedOrUnavailableCount: number;
  readonly uncertainServiceCount: number;
  readonly latestObservedAt: string | null;
}

export interface ProviderTestabilityProvider {
  readonly generatedAt: string;
  readonly provider: { readonly id: string; readonly slug: string; readonly name: string };
  readonly models: readonly {
    readonly id: string;
    readonly canonicalSlug: string;
    readonly marketingName: string;
    readonly status: string;
  }[];
  readonly summary: Omit<ProviderTestabilityProviderSummary, "provider">;
  readonly current: readonly ProviderTestabilityObservation[];
  readonly history: readonly ProviderTestabilityObservation[];
}

export interface ControlJob {
  readonly id: string;
  readonly kind: string;
  readonly status: "queued" | "running" | "succeeded" | "failed";
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly runId: string | null;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface WorkbenchSnapshot {
  readonly build: string;
  readonly control: {
    readonly configured: boolean;
  };
  readonly archive: {
    readonly models: readonly ArchiveModel[];
    readonly tests: readonly ArchiveTest[];
    readonly runs: readonly ArchiveRun[];
  };
}

interface OperatorInput {
  readonly operatorToken: string;
}

interface SubmitRunInput extends OperatorInput {
  readonly modelId: string;
  readonly testCaseId: string;
}

interface ReadJobInput extends OperatorInput {
  readonly jobId: string;
}

interface CatalogInboxInput extends OperatorInput {
  readonly status?: CatalogDiscoveryStatus;
}

interface ReconcileCatalogCandidateInput extends OperatorInput {
  readonly candidateId: string;
  readonly action: "match_existing" | "ignore" | "mark_promotion_ready" | "reopen";
  readonly resolvedModelId?: string;
  readonly note?: string;
}

interface CatalogProviderModelsInput extends OperatorInput {
  readonly providerId: string;
}

interface PromoteCatalogCandidateInput extends OperatorInput {
  readonly candidateId: string;
  readonly canonicalSlug: string;
  readonly marketingName: string;
  readonly status: "preview" | "active";
  readonly note?: string;
}

interface CatalogIdentityCaseInput extends OperatorInput { readonly modelId: string; }

interface DriftReviewInboxInput extends OperatorInput { readonly status?: CatalogDriftReviewStatus; }
interface DecideDriftReviewInput extends OperatorInput {
  readonly eventId: string;
  readonly action: "acknowledge" | "resolve" | "reopen";
  readonly note?: string;
}

interface PresenceReviewInboxInput extends OperatorInput {
  readonly status?: CatalogPresenceReviewStatus;
}

interface DecidePresenceReviewInput extends OperatorInput {
  readonly providerId: string;
  readonly eventId: string;
  readonly action: CatalogPresenceReviewAction;
  readonly note?: string;
}

interface CatalogRemoteIdCaseInput extends OperatorInput {
  readonly providerId: string;
  readonly remoteModelId: string;
}

interface ProviderTestabilityProviderInput extends OperatorInput {
  readonly providerId: string;
}

interface RecordProviderTestabilityObservationWebInput extends OperatorInput {
  readonly providerId: string;
  readonly modelId?: string;
  readonly subjectKind: ProviderTestabilitySubjectKind;
  readonly accessState: ProviderTestabilityAccessState;
  readonly registrationRequirement: string;
  readonly billingRequirement: string;
  readonly regionPolicy: string;
  readonly allowedRegions?: readonly string[];
  readonly blockedRegions?: readonly string[];
  readonly accountTier?: string;
  readonly serviceTier?: string;
  readonly serviceAssurance: ProviderTestabilityServiceAssurance;
  readonly pricing?: {
    readonly currency: string;
    readonly inputPerMillion?: number;
    readonly outputPerMillion?: number;
    readonly perRequest?: number;
  };
  readonly source: {
    readonly sourceType:
      | "provider_docs"
      | "provider_pricing"
      | "provider_policy"
      | "operator_verification";
    readonly url?: string;
    readonly title: string;
    readonly contentSha256?: string;
  };
  readonly note?: string;
}

interface ReadArchiveRunInput {
  readonly runId: string;
}

interface ReadArchiveModelInput {
  readonly modelId: string;
}

interface ReadArchiveTestInput {
  readonly testCaseId: string;
}

interface CompareArchiveInput {
  readonly modelIds: readonly string[];
  readonly testCaseId: string;
  readonly policyVersion?: string;
}

interface ReadArchiveHistoryInput {
  readonly modelId: string;
  readonly testCaseId: string;
  readonly limit?: number;
}


interface ApiOptions {
  readonly method?: "GET" | "POST";
  readonly control?: boolean;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiOrigin(): string {
  const raw =
    process.env.MODELAPSE_API_ORIGIN?.trim() ?? "http://127.0.0.1:3000";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function controlToken(): string {
  const token = process.env.MODELAPSE_CONTROL_TOKEN?.trim();
  if (!token) {
    throw new Error("MODELAPSE_CONTROL_TOKEN is not configured for the web server");
  }
  return token;
}

function apiErrorMessage(payload: unknown, status: number): string {
  if (isRecord(payload)) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : typeof payload.error === "string"
          ? payload.error
          : null;
    if (message) return message;
  }
  return `Modelapse API request failed with HTTP ${status}`;
}

function serializeArchiveMetadata(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value, null, 2) ?? null;
}

function controlAuthDiagnostic(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const reason =
    payload.reason === "missing_authorization" ||
    payload.reason === "invalid_authorization"
      ? payload.reason
      : null;
  const build =
    typeof payload.build === "string" && payload.build
      ? payload.build.slice(0, 12)
      : "unknown";

  if (reason === "missing_authorization") {
    return `API build ${build} did not receive the Authorization header from the Web service. Check MODELAPSE_API_ORIGIN and any reverse proxy between Web and API.`;
  }

  if (reason === "invalid_authorization") {
    return `API build ${build} received the Authorization header but rejected it. The Web/API runtime MODELAPSE_CONTROL_TOKEN values differ, or the Web service is reaching an unexpected API instance.`;
  }

  return null;
}

async function requestJson<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers({
    accept: "application/json",
  });

  if (options.control) {
    headers.set("authorization", `Bearer ${controlToken()}`);
  }
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (options.idempotencyKey) {
    headers.set("idempotency-key", options.idempotencyKey);
  }

  const response = await fetch(new URL(path, apiOrigin()), {
    method: options.method ?? "GET",
    headers,
    cache: "no-store",
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });

  const raw = await response.text();
  let payload: unknown = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: raw };
    }
  }

  if (!response.ok) {
    const diagnostic =
      options.control && response.status === 401
        ? controlAuthDiagnostic(payload)
        : null;
    const message =
      diagnostic ??
      (options.control && response.status === 401
        ? "Modelapse API rejected the Web control credential, but this API did not return auth diagnostics. Verify the Web is reaching the expected API deployment."
        : apiErrorMessage(payload, response.status));

    throw new ApiRequestError(response.status, message);
  }

  return payload as T;
}

function parseOperatorToken(value: unknown): string {
  if (!isRecord(value)) throw new Error("Operator request must be an object");

  const operatorToken = value.operatorToken;
  if (
    typeof operatorToken !== "string" ||
    !operatorToken ||
    operatorToken.length > 512
  ) {
    throw new Error("Operator token is required");
  }
  return operatorToken;
}

function parseOperatorInput(value: unknown): OperatorInput {
  return { operatorToken: parseOperatorToken(value) };
}

function parseSubmitRunInput(value: unknown): SubmitRunInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Run request must be an object");

  const modelId = value.modelId;
  const testCaseId = value.testCaseId;

  if (typeof modelId !== "string" || !UUID_RE.test(modelId)) {
    throw new Error("modelId must be a UUID");
  }
  if (typeof testCaseId !== "string" || !UUID_RE.test(testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }

  return { operatorToken, modelId, testCaseId };
}

function parseReadJobInput(value: unknown): ReadJobInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Job request must be an object");

  const jobId = value.jobId;
  if (typeof jobId !== "string" || !UUID_RE.test(jobId)) {
    throw new Error("jobId must be a UUID");
  }

  return { operatorToken, jobId };
}

function parseCatalogInboxInput(value: unknown): CatalogInboxInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Catalog Inbox request must be an object");
  const status = value.status;
  if (
    status !== undefined &&
    status !== "discovered" &&
    status !== "matched" &&
    status !== "ignored" &&
    status !== "promotion_ready"
  ) {
    throw new Error("Invalid catalog discovery status");
  }
  return { operatorToken, ...(status ? { status } : {}) };
}

function parseReconcileCatalogCandidateInput(
  value: unknown,
): ReconcileCatalogCandidateInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Reconciliation request must be an object");
  const candidateId = value.candidateId;
  const action = value.action;
  const note = value.note;
  const resolvedModelId = value.resolvedModelId;
  if (typeof candidateId !== "string" || !UUID_RE.test(candidateId)) {
    throw new Error("candidateId must be a UUID");
  }
  if (
    action !== "match_existing" &&
    action !== "ignore" &&
    action !== "mark_promotion_ready" &&
    action !== "reopen"
  ) {
    throw new Error("Unsupported Inbox reconciliation action");
  }
  if (note !== undefined && typeof note !== "string") {
    throw new Error("note must be a string");
  }
  if (
    resolvedModelId !== undefined &&
    (typeof resolvedModelId !== "string" || !UUID_RE.test(resolvedModelId))
  ) {
    throw new Error("resolvedModelId must be a UUID");
  }
  if (action === "match_existing" && typeof resolvedModelId !== "string") {
    throw new Error("match_existing requires resolvedModelId");
  }
  return {
    operatorToken,
    candidateId,
    action,
    ...(typeof resolvedModelId === "string" ? { resolvedModelId } : {}),
    ...(typeof note === "string" ? { note } : {}),
  };
}

function parseCatalogProviderModelsInput(value: unknown): CatalogProviderModelsInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Provider models request must be an object");
  const providerId = value.providerId;
  if (typeof providerId !== "string" || !UUID_RE.test(providerId)) {
    throw new Error("providerId must be a UUID");
  }
  return { operatorToken, providerId };
}

function parsePromoteCatalogCandidateInput(
  value: unknown,
): PromoteCatalogCandidateInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Promotion request must be an object");
  const candidateId = value.candidateId;
  const canonicalSlug = value.canonicalSlug;
  const marketingName = value.marketingName;
  const status = value.status;
  const note = value.note;
  if (typeof candidateId !== "string" || !UUID_RE.test(candidateId)) {
    throw new Error("candidateId must be a UUID");
  }
  if (
    typeof canonicalSlug !== "string" ||
    !/^[a-z0-9][a-z0-9-]*$/.test(canonicalSlug)
  ) {
    throw new Error("canonicalSlug must use lowercase letters, digits, and hyphens");
  }
  if (typeof marketingName !== "string" || !marketingName.trim()) {
    throw new Error("marketingName is required");
  }
  if (status !== "preview" && status !== "active") {
    throw new Error("status must be preview or active");
  }
  if (note !== undefined && typeof note !== "string") {
    throw new Error("note must be a string");
  }
  return {
    operatorToken,
    candidateId,
    canonicalSlug,
    marketingName,
    status,
    ...(typeof note === "string" ? { note } : {}),
  };
}

function parseCatalogIdentityCaseInput(value: unknown): CatalogIdentityCaseInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Identity Case request must be an object");
  const modelId = value.modelId;
  if (typeof modelId !== "string" || !UUID_RE.test(modelId)) {
    throw new Error("modelId must be a UUID");
  }
  return { operatorToken, modelId };
}

function parseDriftReviewInboxInput(value: unknown): DriftReviewInboxInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Drift review request must be an object");
  const status = value.status;
  if (status !== undefined && status !== "open" && status !== "acknowledged" && status !== "resolved") {
    throw new Error("Invalid drift review status");
  }
  return { operatorToken, ...(status ? { status } : {}) };
}

function parseDecideDriftReviewInput(value: unknown): DecideDriftReviewInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Drift review decision must be an object");
  const eventId = value.eventId;
  const action = value.action;
  const note = value.note;
  if (typeof eventId !== "string" || !eventId.trim()) throw new Error("eventId is required");
  if (action !== "acknowledge" && action !== "resolve" && action !== "reopen") throw new Error("Unsupported drift review action");
  if (note !== undefined && typeof note !== "string") throw new Error("note must be a string");
  return { operatorToken, eventId, action, ...(typeof note === "string" ? { note } : {}) };
}

function parsePresenceReviewInboxInput(value: unknown): PresenceReviewInboxInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Presence review request must be an object");
  const status = value.status;
  if (
    status !== undefined &&
    status !== "open" &&
    status !== "acknowledged" &&
    status !== "resolved"
  ) {
    throw new Error("Invalid catalog presence review status");
  }
  return { operatorToken, ...(status ? { status } : {}) };
}

function parseDecidePresenceReviewInput(value: unknown): DecidePresenceReviewInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Presence review decision must be an object");
  const providerId = value.providerId;
  const eventId = value.eventId;
  const action = value.action;
  const note = value.note;
  if (typeof providerId !== "string" || !UUID_RE.test(providerId)) {
    throw new Error("providerId must be a UUID");
  }
  if (typeof eventId !== "string" || !eventId.trim()) {
    throw new Error("eventId is required");
  }
  if (action !== "acknowledge" && action !== "resolve" && action !== "reopen") {
    throw new Error("Unsupported catalog presence review action");
  }
  if (note !== undefined && typeof note !== "string") {
    throw new Error("note must be a string");
  }
  return {
    operatorToken,
    providerId,
    eventId,
    action,
    ...(typeof note === "string" ? { note } : {}),
  };
}

function parseCatalogRemoteIdCaseInput(value: unknown): CatalogRemoteIdCaseInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Remote ID Case request must be an object");
  const providerId = value.providerId;
  const remoteModelId = value.remoteModelId;
  if (typeof providerId !== "string" || !UUID_RE.test(providerId)) {
    throw new Error("providerId must be a UUID");
  }
  if (
    typeof remoteModelId !== "string" ||
    !remoteModelId.trim() ||
    remoteModelId.length > 512
  ) {
    throw new Error("remoteModelId must be a non-empty string");
  }
  return { operatorToken, providerId, remoteModelId: remoteModelId.trim() };
}

function parseProviderTestabilityProviderInput(
  value: unknown,
): ProviderTestabilityProviderInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Provider testability request must be an object");
  const providerId = value.providerId;
  if (typeof providerId !== "string" || !UUID_RE.test(providerId)) {
    throw new Error("providerId must be a UUID");
  }
  return { operatorToken, providerId };
}

function parseProviderTestabilityObservationInput(
  value: unknown,
): RecordProviderTestabilityObservationWebInput {
  const operatorToken = parseOperatorToken(value);
  if (!isRecord(value)) throw new Error("Provider testability observation must be an object");

  const providerId = value.providerId;
  const modelId = value.modelId;
  const subjectKind = value.subjectKind;
  const accessState = value.accessState;
  const registrationRequirement = value.registrationRequirement;
  const billingRequirement = value.billingRequirement;
  const regionPolicy = value.regionPolicy;
  const allowedRegions = value.allowedRegions;
  const blockedRegions = value.blockedRegions;
  const accountTier = value.accountTier;
  const serviceTier = value.serviceTier;
  const serviceAssurance = value.serviceAssurance;
  const pricing = value.pricing;
  const source = value.source;
  const note = value.note;

  if (typeof providerId !== "string" || !UUID_RE.test(providerId)) {
    throw new Error("providerId must be a UUID");
  }
  if (modelId !== undefined && (typeof modelId !== "string" || !UUID_RE.test(modelId))) {
    throw new Error("modelId must be a UUID");
  }
  if (subjectKind !== "provider_policy" && subjectKind !== "runner_access") {
    throw new Error("Invalid testability subject kind");
  }
  if (!["available", "restricted", "unavailable", "unknown"].includes(String(accessState))) {
    throw new Error("Invalid testability access state");
  }
  if (
    typeof registrationRequirement !== "string" ||
    typeof billingRequirement !== "string" ||
    typeof regionPolicy !== "string" ||
    !["documented_default", "documented_variant", "operator_uncertain", "unknown"].includes(
      String(serviceAssurance),
    )
  ) {
    throw new Error("Invalid provider testability classification");
  }
  for (const [label, regions] of [
    ["allowedRegions", allowedRegions],
    ["blockedRegions", blockedRegions],
  ] as const) {
    if (
      regions !== undefined &&
      (!Array.isArray(regions) || regions.some((region) => typeof region !== "string"))
    ) {
      throw new Error(label + " must be a string array");
    }
  }
  if (accountTier !== undefined && typeof accountTier !== "string") {
    throw new Error("accountTier must be a string");
  }
  if (serviceTier !== undefined && typeof serviceTier !== "string") {
    throw new Error("serviceTier must be a string");
  }
  if (note !== undefined && typeof note !== "string") {
    throw new Error("note must be a string");
  }
  if (!isRecord(source) || typeof source.sourceType !== "string" || typeof source.title !== "string") {
    throw new Error("source is required");
  }
  if (source.url !== undefined && typeof source.url !== "string") {
    throw new Error("source.url must be a string");
  }
  if (source.contentSha256 !== undefined && typeof source.contentSha256 !== "string") {
    throw new Error("source.contentSha256 must be a string");
  }

  let normalizedPricing: RecordProviderTestabilityObservationWebInput["pricing"];
  if (pricing !== undefined) {
    if (!isRecord(pricing) || typeof pricing.currency !== "string") {
      throw new Error("pricing.currency is required");
    }
    for (const key of ["inputPerMillion", "outputPerMillion", "perRequest"] as const) {
      const candidate = pricing[key];
      if (candidate !== undefined && typeof candidate !== "number") {
        throw new Error("pricing." + key + " must be a number");
      }
    }
    normalizedPricing = {
      currency: pricing.currency,
      ...(typeof pricing.inputPerMillion === "number"
        ? { inputPerMillion: pricing.inputPerMillion }
        : {}),
      ...(typeof pricing.outputPerMillion === "number"
        ? { outputPerMillion: pricing.outputPerMillion }
        : {}),
      ...(typeof pricing.perRequest === "number" ? { perRequest: pricing.perRequest } : {}),
    };
  }

  return {
    operatorToken,
    providerId,
    ...(typeof modelId === "string" ? { modelId } : {}),
    subjectKind,
    accessState: accessState as ProviderTestabilityAccessState,
    registrationRequirement,
    billingRequirement,
    regionPolicy,
    ...(Array.isArray(allowedRegions) ? { allowedRegions: allowedRegions as string[] } : {}),
    ...(Array.isArray(blockedRegions) ? { blockedRegions: blockedRegions as string[] } : {}),
    ...(typeof accountTier === "string" ? { accountTier } : {}),
    ...(typeof serviceTier === "string" ? { serviceTier } : {}),
    serviceAssurance: serviceAssurance as ProviderTestabilityServiceAssurance,
    ...(normalizedPricing ? { pricing: normalizedPricing } : {}),
    source: {
      sourceType: source.sourceType as RecordProviderTestabilityObservationWebInput["source"]["sourceType"],
      ...(typeof source.url === "string" ? { url: source.url } : {}),
      title: source.title,
      ...(typeof source.contentSha256 === "string"
        ? { contentSha256: source.contentSha256 }
        : {}),
    },
    ...(typeof note === "string" ? { note } : {}),
  };
}

function parseArchiveRunInput(value: unknown): ReadArchiveRunInput {
  if (!isRecord(value)) throw new Error("Archive Run request must be an object");

  const runId = value.runId;
  if (typeof runId !== "string" || !UUID_RE.test(runId)) {
    throw new Error("runId must be a UUID");
  }

  return { runId };
}

function parseArchiveModelInput(value: unknown): ReadArchiveModelInput {
  if (!isRecord(value)) throw new Error("Archive Model request must be an object");

  const modelId = value.modelId;
  if (typeof modelId !== "string" || !UUID_RE.test(modelId)) {
    throw new Error("modelId must be a UUID");
  }

  return { modelId };
}

function parseArchiveTestInput(value: unknown): ReadArchiveTestInput {
  if (!isRecord(value)) throw new Error("Archive Test request must be an object");

  const testCaseId = value.testCaseId;
  if (typeof testCaseId !== "string" || !UUID_RE.test(testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }

  return { testCaseId };
}

function parseArchiveHistoryInput(value: unknown): ReadArchiveHistoryInput {
  if (!isRecord(value)) throw new Error("Archive history request must be an object");

  const modelId = value.modelId;
  const testCaseId = value.testCaseId;
  const limit = value.limit;

  if (typeof modelId !== "string" || !UUID_RE.test(modelId)) {
    throw new Error("modelId must be a UUID");
  }
  if (typeof testCaseId !== "string" || !UUID_RE.test(testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }
  if (
    limit !== undefined &&
    (typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100)
  ) {
    throw new Error("limit must be an integer between 1 and 100");
  }

  return {
    modelId,
    testCaseId,
    ...(limit === undefined ? {} : { limit }),
  };
}

function parseArchiveComparisonInput(value: unknown): CompareArchiveInput {
  if (!isRecord(value)) throw new Error("Archive comparison request must be an object");

  const modelIds = value.modelIds;
  const testCaseId = value.testCaseId;
  const policyVersion = value.policyVersion;

  if (
    !Array.isArray(modelIds) ||
    modelIds.length < 2 ||
    modelIds.length > 4 ||
    modelIds.some((modelId) => typeof modelId !== "string" || !UUID_RE.test(modelId)) ||
    new Set(modelIds).size !== modelIds.length
  ) {
    throw new Error("modelIds must contain between 2 and 4 unique UUIDs");
  }
  if (typeof testCaseId !== "string" || !UUID_RE.test(testCaseId)) {
    throw new Error("testCaseId must be a UUID");
  }
  if (
    policyVersion !== undefined &&
    (typeof policyVersion !== "string" ||
      !/^[a-z0-9][a-z0-9._-]*$/.test(policyVersion))
  ) {
    throw new Error("policyVersion is invalid");
  }

  return {
    modelIds: modelIds as string[],
    testCaseId,
    ...(typeof policyVersion === "string" ? { policyVersion } : {}),
  };
}

function requireOperator(candidate: string): void {
  const expected = process.env.MODELAPSE_WEB_OPERATOR_TOKEN;
  if (!expected) {
    throw new Error("Operator Run access is disabled on this web deployment");
  }

  const actualBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw new Error("Invalid operator token");
  }
}

export const getWorkbenchSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkbenchSnapshot> => {
    const [archiveModels, archiveTests, archiveRuns] = await Promise.all([
      requestJson<{ models: readonly ArchiveModel[] }>("/v1/archive/models"),
      requestJson<{ tests: readonly ArchiveTest[] }>("/v1/archive/tests"),
      requestJson<{ runs: readonly ArchiveRun[] }>("/v1/archive/runs?limit=30"),
    ]);

    return {
      build: process.env.MODELAPSE_BUILD ?? "dev",
      control: {
        configured: Boolean(
          process.env.MODELAPSE_CONTROL_TOKEN &&
            process.env.MODELAPSE_WEB_OPERATOR_TOKEN,
        ),
      },
      archive: {
        models: archiveModels.models,
        tests: archiveTests.tests,
        runs: archiveRuns.runs,
      },
    };
  },
);

export const getArchiveRun = createServerFn({ method: "POST" })
  .validator(parseArchiveRunInput)
  .handler(async ({ data }): Promise<ArchiveRunDetail | null> => {
    try {
      const result = await requestJson<{ run: ArchiveRunDetailWire }>(
        `/v1/archive/runs/${data.runId}`,
      );
      const { config, usage, timing, ...run } = result.run;
      return {
        ...run,
        configJson: serializeArchiveMetadata(config),
        usageJson: serializeArchiveMetadata(usage),
        timingJson: serializeArchiveMetadata(timing),
      };
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const getArchiveCatalogChanges = createServerFn({ method: "GET" }).handler(
  async (): Promise<readonly ArchiveCatalogChange[]> => {
    const result = await requestJson<{ changes: readonly ArchiveCatalogChange[] }>(
      "/v1/archive/changes?limit=100",
    );
    return result.changes;
  },
);

export const getArchiveCatalog = createServerFn({ method: "GET" }).handler(
  async (): Promise<ArchiveCatalog> => {
    const [models, tests] = await Promise.all([
      requestJson<{ models: readonly ArchiveModel[] }>("/v1/archive/models"),
      requestJson<{ tests: readonly ArchiveTest[] }>("/v1/archive/tests"),
    ]);
    return {
      models: models.models,
      tests: tests.tests,
    };
  },
);

export const getArchiveModel = createServerFn({ method: "POST" })
  .validator(parseArchiveModelInput)
  .handler(async ({ data }): Promise<ArchiveModelDetail | null> => {
    try {
      const result = await requestJson<{ model: ArchiveModelDetail }>(
        `/v1/archive/models/${data.modelId}`,
      );
      return result.model;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const getArchiveTest = createServerFn({ method: "POST" })
  .validator(parseArchiveTestInput)
  .handler(async ({ data }): Promise<ArchiveTestDetail | null> => {
    try {
      const result = await requestJson<{ test: ArchiveTestDetail }>(
        `/v1/archive/tests/${data.testCaseId}`,
      );
      return result.test;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const getArchiveRunHistory = createServerFn({ method: "POST" })
  .validator(parseArchiveHistoryInput)
  .handler(async ({ data }): Promise<ArchiveRunHistory | null> => {
    const params = new URLSearchParams({
      modelId: data.modelId,
      testCaseId: data.testCaseId,
      limit: String(data.limit ?? 50),
    });
    try {
      const result = await requestJson<{ history: ArchiveRunHistory }>(
        `/v1/archive/history?${params.toString()}`,
      );
      return result.history;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const compareArchiveHistory = createServerFn({ method: "POST" })
  .validator(parseArchiveComparisonInput)
  .handler(async ({ data }): Promise<ArchiveTemporalComparison | null> => {
    const histories = await Promise.all(
      data.modelIds.map(async (modelId) => {
        const params = new URLSearchParams({
          modelId,
          testCaseId: data.testCaseId,
          limit: "20",
        });
        try {
          const result = await requestJson<{ history: ArchiveRunHistory }>(
            `/v1/archive/history?${params.toString()}`,
          );
          return result.history;
        } catch (error) {
          if (error instanceof ApiRequestError && error.status === 404) {
            return null;
          }
          throw error;
        }
      }),
    );

    if (histories.some((history) => history === null)) {
      return null;
    }

    const complete = histories.filter(
      (history): history is ArchiveRunHistory => history !== null,
    );
    const first = complete[0];
    if (!first) return null;

    return {
      test: first.test,
      rows: complete.map((history) => ({
        model: history.model,
        runs: history.runs,
        relations: history.relations,
      })),
    };
  });

export const compareArchive = createServerFn({ method: "POST" })
  .validator(parseArchiveComparisonInput)
  .handler(async ({ data }): Promise<ArchiveComparison | null> => {
    const modelIds = data.modelIds.join(",");
    try {
      const params = new URLSearchParams({
        modelIds,
        testCaseId: data.testCaseId,
      });
      if (data.policyVersion) params.set("policyVersion", data.policyVersion);
      const result = await requestJson<{ comparison: ArchiveComparison }>(
        `/v1/archive/compare?${params.toString()}`,
      );
      return result.comparison;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) {
        return null;
      }
      throw error;
    }
  });

export const getProviderTestabilityProviders = createServerFn({ method: "POST" })
  .validator(parseOperatorInput)
  .handler(async ({ data }): Promise<readonly ProviderTestabilityProviderSummary[]> => {
    requireOperator(data.operatorToken);
    const result = await requestJson<{
      providers: readonly ProviderTestabilityProviderSummary[];
    }>("/v1/control/provider-testability", { control: true });
    return result.providers;
  });

export const getProviderTestabilityProvider = createServerFn({ method: "POST" })
  .validator(parseProviderTestabilityProviderInput)
  .handler(async ({ data }): Promise<ProviderTestabilityProvider | null> => {
    requireOperator(data.operatorToken);
    try {
      const result = await requestJson<{ provider: ProviderTestabilityProvider }>(
        `/v1/control/provider-testability/${data.providerId}`,
        { control: true },
      );
      return result.provider;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  });

export const recordProviderTestabilityObservation = createServerFn({ method: "POST" })
  .validator(parseProviderTestabilityObservationInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);
    return requestJson<{ observationId: string; sourceRecordId: string }>(
      "/v1/control/provider-testability/observations",
      {
        method: "POST",
        control: true,
        body: {
          providerId: data.providerId,
          ...(data.modelId ? { modelId: data.modelId } : {}),
          executionPath: "first_party_direct",
          subjectKind: data.subjectKind,
          accessState: data.accessState,
          registrationRequirement: data.registrationRequirement,
          billingRequirement: data.billingRequirement,
          regionPolicy: data.regionPolicy,
          ...(data.allowedRegions ? { allowedRegions: data.allowedRegions } : {}),
          ...(data.blockedRegions ? { blockedRegions: data.blockedRegions } : {}),
          ...(data.accountTier ? { accountTier: data.accountTier } : {}),
          ...(data.serviceTier ? { serviceTier: data.serviceTier } : {}),
          serviceAssurance: data.serviceAssurance,
          ...(data.pricing ? { pricing: data.pricing } : {}),
          source: data.source,
          actor: "web-operator",
          ...(data.note ? { note: data.note } : {}),
        },
      },
    );
  });

export const getCatalogPresenceHistory = createServerFn({ method: "POST" })
  .validator(parseCatalogProviderModelsInput)
  .handler(async ({ data }): Promise<CatalogPresenceHistory | null> => {
    requireOperator(data.operatorToken);
    try {
      const result = await requestJson<{ history: CatalogPresenceHistory }>(
        `/v1/control/catalog/presence/${data.providerId}`,
        { control: true },
      );
      return result.history;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  });

export const getCatalogPresenceReviewInbox = createServerFn({ method: "POST" })
  .validator(parsePresenceReviewInboxInput)
  .handler(async ({ data }): Promise<readonly CatalogPresenceReviewItem[]> => {
    requireOperator(data.operatorToken);
    const params = new URLSearchParams({ limit: "200" });
    if (data.status) params.set("status", data.status);
    const result = await requestJson<{ items: readonly CatalogPresenceReviewItem[] }>(
      `/v1/control/catalog/presence-reviews?${params.toString()}`,
      { control: true },
    );
    return result.items;
  });

export const decideCatalogPresenceReview = createServerFn({ method: "POST" })
  .validator(parseDecidePresenceReviewInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);
    return requestJson<{
      eventId: string;
      eventAuditId: string;
      status: CatalogPresenceReviewStatus;
    }>("/v1/control/catalog/presence-reviews/decide", {
      method: "POST",
      control: true,
      body: {
        providerId: data.providerId,
        eventId: data.eventId,
        action: data.action,
        actor: "web-operator",
        ...(data.note ? { note: data.note } : {}),
      },
    });
  });

export const getCatalogRemoteIdCase = createServerFn({ method: "POST" })
  .validator(parseCatalogRemoteIdCaseInput)
  .handler(async ({ data }): Promise<CatalogRemoteIdCase | null> => {
    requireOperator(data.operatorToken);
    const params = new URLSearchParams({ remoteModelId: data.remoteModelId });
    try {
      const result = await requestJson<{ remoteCase: CatalogRemoteIdCase }>(
        `/v1/control/catalog/remote-cases/${data.providerId}?${params.toString()}`,
        { control: true },
      );
      return result.remoteCase;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  });

export const getCatalogCoverageProviders = createServerFn({ method: "POST" })
  .validator(parseOperatorInput)
  .handler(async ({ data }): Promise<readonly CatalogProviderCoverageSummary[]> => {
    requireOperator(data.operatorToken);
    const result = await requestJson<{ providers: readonly CatalogProviderCoverageSummary[] }>(
      "/v1/control/catalog/coverage",
      { control: true },
    );
    return result.providers;
  });

export const getCatalogProviderCoverage = createServerFn({ method: "POST" })
  .validator(parseCatalogProviderModelsInput)
  .handler(async ({ data }): Promise<CatalogProviderCoverage | null> => {
    requireOperator(data.operatorToken);
    try {
      const result = await requestJson<{ coverage: CatalogProviderCoverage }>(
        `/v1/control/catalog/coverage/${data.providerId}`,
        { control: true },
      );
      return result.coverage;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  });

export const getCatalogIntegrity = createServerFn({ method: "POST" })
  .validator(parseOperatorInput)
  .handler(async ({ data }): Promise<CatalogIntegrityDashboard> => {
    requireOperator(data.operatorToken);
    const result = await requestJson<{ dashboard: CatalogIntegrityDashboard }>(
      "/v1/control/catalog/integrity",
      { control: true },
    );
    return result.dashboard;
  });

export const getCatalogIdentityCase = createServerFn({ method: "POST" })
  .validator(parseCatalogIdentityCaseInput)
  .handler(async ({ data }): Promise<CatalogIdentityCase | null> => {
    requireOperator(data.operatorToken);
    try {
      const result = await requestJson<{ identityCase: CatalogIdentityCase }>(
        `/v1/control/catalog/identity-cases/${data.modelId}`,
        { control: true },
      );
      return result.identityCase;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return null;
      throw error;
    }
  });

export const getDriftReviewInbox = createServerFn({ method: "POST" })
  .validator(parseDriftReviewInboxInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);
    const query = data.status ? `?status=${encodeURIComponent(data.status)}` : "";
    const result = await requestJson<{ items: readonly CatalogDriftReviewItem[] }>(
      `/v1/control/catalog/drift-reviews${query}`, { control: true },
    );
    return result.items;
  });

export const decideDriftReview = createServerFn({ method: "POST" })
  .validator(parseDecideDriftReviewInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);
    return requestJson<{ eventId: string; eventAuditId: string; status: CatalogDriftReviewStatus }>(
      "/v1/control/catalog/drift-reviews/decide",
      { method: "POST", control: true, body: { eventId: data.eventId, action: data.action, actor: "web-operator", ...(data.note ? { note: data.note } : {}) } },
    );
  });

export const getCatalogInbox = createServerFn({ method: "POST" })
  .validator(parseCatalogInboxInput)
  .handler(async ({ data }): Promise<readonly CatalogDiscoveryCandidate[]> => {
    requireOperator(data.operatorToken);
    const params = new URLSearchParams({ limit: "200" });
    if (data.status) params.set("status", data.status);
    const result = await requestJson<{
      candidates: readonly CatalogDiscoveryCandidate[];
    }>(`/v1/control/catalog/discoveries?${params.toString()}`, {
      control: true,
    });
    return result.candidates;
  });

export const getCatalogProviderModels = createServerFn({ method: "POST" })
  .validator(parseCatalogProviderModelsInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);
    const result = await requestJson<{
      models: readonly {
        id: string;
        canonicalSlug: string;
        marketingName: string;
        status: string;
      }[];
    }>(`/v1/control/catalog/providers/${data.providerId}/models`, {
      control: true,
    });
    return result.models;
  });

export const reconcileCatalogCandidate = createServerFn({ method: "POST" })
  .validator(parseReconcileCatalogCandidateInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);
    return requestJson<{ eventId: string; status: CatalogDiscoveryStatus }>(
      `/v1/control/catalog/discoveries/${data.candidateId}/reconcile`,
      {
        method: "POST",
        control: true,
        body: {
          action: data.action,
          actor: "web-operator",
          ...(data.resolvedModelId
            ? { resolvedModelId: data.resolvedModelId }
            : {}),
          ...(data.note ? { note: data.note } : {}),
        },
      },
    );
  });

export const promoteCatalogCandidate = createServerFn({ method: "POST" })
  .validator(parsePromoteCatalogCandidateInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);
    return requestJson<{
      candidateId: string;
      modelId: string;
      promotionEventId: string;
      reconciliationEventId: string;
    }>(`/v1/control/catalog/discoveries/${data.candidateId}/promote`, {
      method: "POST",
      control: true,
      body: {
        canonicalSlug: data.canonicalSlug,
        marketingName: data.marketingName,
        status: data.status,
        actor: "web-operator",
        ...(data.note ? { note: data.note } : {}),
      },
    });
  });

export const getControlCatalog = createServerFn({ method: "POST" })
  .validator(parseOperatorInput)
  .handler(async ({ data }): Promise<ControlCatalog> => {
    requireOperator(data.operatorToken);

    const [modelResult, testResult] = await Promise.all([
      requestJson<{ models: readonly RunnableModel[] }>(
        "/v1/control/catalog/models",
        { control: true },
      ),
      requestJson<{ tests: readonly RunnableTest[] }>(
        "/v1/control/catalog/tests",
        { control: true },
      ),
    ]);

    return {
      models: modelResult.models,
      tests: testResult.tests,
    };
  });

export const submitRun = createServerFn({ method: "POST" })
  .validator(parseSubmitRunInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);

    return requestJson<{
      selection: {
        model: Pick<
          RunnableModel,
          "id" | "provider" | "marketingName" | "apiModelId"
        >;
        test: {
          testCaseId: string;
          familySlug: string;
          variantSlug: string;
          version: string;
          caseSlug: string;
          evaluator: RunnableTest["evaluator"];
        };
      };
      job: ControlJob;
    }>("/v1/control/runs", {
      method: "POST",
      control: true,
      body: {
        modelId: data.modelId,
        testCaseId: data.testCaseId,
      },
      idempotencyKey: `web-${randomUUID()}`,
    });
  });

export const readJob = createServerFn({ method: "POST" })
  .validator(parseReadJobInput)
  .handler(async ({ data }) => {
    requireOperator(data.operatorToken);

    const result = await requestJson<{ job: ControlJob }>(
      `/v1/control/run-jobs/${data.jobId}`,
      { control: true },
    );

    let run: ArchiveRun | null = null;
    if (result.job.runId) {
      try {
        const archived = await requestJson<{ run: ArchiveRun }>(
          `/v1/archive/runs/${result.job.runId}`,
        );
        run = archived.run;
      } catch (error) {
        if (!(error instanceof ApiRequestError) || error.status !== 404) {
          throw error;
        }
      }
    }

    return {
      job: result.job,
      run,
    };
  });
