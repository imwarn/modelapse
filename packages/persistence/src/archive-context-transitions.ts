import type { ArchiveRunView } from "./archive-repository.js";

export interface ArchiveContextDifference {
  readonly field: string;
  readonly previous: string;
  readonly current: string;
  readonly kind: "execution" | "evidence";
}

export interface ArchiveContextTransition {
  readonly runId: string;
  readonly previousRunId: string | null;
  readonly status: "baseline" | "unchanged" | "changed" | "evidence_changed" | "unknown";
  readonly changes: readonly ArchiveContextDifference[];
  readonly unknownFields: readonly string[];
  readonly caveats: readonly string[];
}

/**
 * Compare archived snapshots, never mutable current Provider/Runner state.
 * Unknown values must not silently compare as equal or count as a change.
 */
export function archiveContextTransitions(
  runs: readonly ArchiveRunView[],
): readonly ArchiveContextTransition[] {
  const projection = (run: ArchiveRunView) => {
    const q = run.executionQualification;
    const effectiveTier = q?.returnedServiceTier ?? q?.serviceTier ?? null;
    return [
      ["execution_path", run.executionPath, "execution"],
      ["environment", q?.executionEnvironment?.id ?? null, "execution"],
      ["region", q?.executionRegion ?? null, "execution"],
      ["account_tier", q?.accountTier ?? null, "execution"],
      ["service_tier", q?.serviceTier ?? null, "execution"],
      ["effective_service_tier", effectiveTier, "execution"],
      ["service_assurance", q?.serviceAssurance ?? null, "execution"],
      ["provider_policy_observation", q?.providerPolicyObservation?.id ?? null, "evidence"],
      ["runner_access_observation", q?.runnerAccessObservation?.id ?? null, "evidence"],
      ["fleet_capability_event", q?.executionEnvironment?.capabilityEventId ?? null, "evidence"],
    ] as const;
  };

  return runs.map((run, index) => {
    const prior = runs[index - 1];
    const caveats = [
      ...(run.executionQualification?.caveats ?? ["execution_qualification_missing"]),
      ...(run.cost?.caveats ?? []),
    ];
    if (!run.executionQualification?.executionEnvironment) {
      caveats.push("execution_environment_unassigned");
    }

    if (!prior) {
      return {
        runId: run.id,
        previousRunId: null,
        status: "baseline" as const,
        changes: [],
        unknownFields: [],
        caveats: [...new Set(caveats)],
      };
    }

    const before = projection(prior);
    const after = projection(run);
    const changes: ArchiveContextDifference[] = [];
    const unknownFields: string[] = [];
    for (let i = 0; i < before.length; i += 1) {
      const [field, previous, kind] = before[i]!;
      const current = after[i]![1];
      if (previous === null || current === null) {
        unknownFields.push(field);
      } else if (previous !== current) {
        changes.push({ field, previous, current, kind });
      }
    }

    const executionChanged = changes.some((change) => change.kind === "execution");
    const status: ArchiveContextTransition["status"] = executionChanged
      ? "changed"
      : unknownFields.length > 0
        ? "unknown"
        : changes.length > 0
          ? "evidence_changed"
          : "unchanged";

    return {
      runId: run.id,
      previousRunId: prior.id,
      status,
      changes,
      unknownFields,
      caveats: [...new Set(caveats)],
    };
  });
}
