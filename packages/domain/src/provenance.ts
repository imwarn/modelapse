export const executionPaths = [
  "first_party_direct",
  "first_party_product",
  "routed_provider",
  "cloud_hosted",
  "community_claimed",
] as const;

export type ExecutionPath = (typeof executionPaths)[number];

export const evidenceLevels = ["E0", "E1", "E2", "E3", "E4", "E5"] as const;
export type EvidenceLevel = (typeof evidenceLevels)[number];

const evidenceRankMap: Record<EvidenceLevel, number> = {
  E0: 0,
  E1: 1,
  E2: 2,
  E3: 3,
  E4: 4,
  E5: 5,
};

export function evidenceRank(level: EvidenceLevel): number {
  return evidenceRankMap[level];
}

export function isEvidenceCompatible(
  path: ExecutionPath,
  level: EvidenceLevel,
): boolean {
  if (path === "community_claimed" && evidenceRank(level) > evidenceRank("E2")) {
    return false;
  }
  if (level === "E4" && path !== "first_party_direct") {
    return false;
  }
  return true;
}

export interface EvidenceSummary {
  readonly executionPath: ExecutionPath;
  readonly level: EvidenceLevel;
  readonly collector: string;
  readonly sourceUrl?: string;
  readonly attestationRef?: string;
  readonly createdAt: string;
}
