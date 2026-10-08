import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  compareArchive,
  compareArchiveHistory,
  getArchiveCatalog,
  getArchiveComparabilityPolicies,
  type ArchiveComparison,
  type ArchiveRun,
  type ArchiveTemporalComparison,
} from "../modelapse";

export const Route = createFileRoute("/compare")({
  loader: async () => {
    const [catalog, policies] = await Promise.all([
      getArchiveCatalog(),
      getArchiveComparabilityPolicies(),
    ]);
    return { catalog, policies };
  },
  component: ArchiveComparePage,
});

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toISOString().replace("T", " ").replace(".000Z", "Z");
}

function evaluationLabel(run: ArchiveRun | null): string {
  if (!run) return "no Run";
  if (!run.evaluation) return "not evaluated";
  if (run.evaluation.exactMatch === true) return "exact match";
  if (run.evaluation.exactMatch === false) return "mismatch";
  return run.evaluation.status;
}

function evaluationClass(run: ArchiveRun | null): string {
  if (run?.evaluation?.exactMatch === true) return "badge badge-pass";
  if (run?.evaluation?.exactMatch === false) return "badge badge-fail";
  return "badge";
}

function contextRelation(
  run: ArchiveRun,
  reference: ArchiveRun | null,
): "matched" | "mismatched" | "unknown" {
  if (!reference) return "unknown";
  const execution = (value: ArchiveRun): readonly (string | null)[] => [
    value.executionPath,
    value.executionQualification?.executionRegion ?? null,
    value.executionQualification?.accountTier ?? null,
    value.executionQualification?.returnedServiceTier ??
      value.executionQualification?.serviceTier ?? null,
    value.executionQualification?.serviceAssurance ?? null,
  ];
  const current = execution(run);
  const baseline = execution(reference);
  const assurance = run.executionQualification?.serviceAssurance;
  const baselineAssurance = reference.executionQualification?.serviceAssurance;
  if (
    current.some((value) => value === null) ||
    baseline.some((value) => value === null) ||
    !["documented_default", "documented_variant"].includes(assurance ?? "") ||
    !["documented_default", "documented_variant"].includes(
      baselineAssurance ?? "",
    )
  ) {
    return "unknown";
  }
  return current.every((value, index) => value === baseline[index])
    ? "matched"
    : "mismatched";
}

function ArchiveComparePage() {
  const { catalog, policies } = Route.useLoaderData();
  const firstModel = catalog.models[0];
  const secondModel =
    catalog.models.find(
      (model) => firstModel && model.provider.id !== firstModel.provider.id,
    ) ?? catalog.models[1];
  const defaultModelIds = [firstModel?.id, secondModel?.id].filter(
    (id): id is string => Boolean(id),
  );
  const comparableTests = catalog.tests.filter(
    (test) => test.category !== "calibration",
  );
  const [modelIds, setModelIds] = useState<readonly string[]>(defaultModelIds);
  const [testCaseId, setTestCaseId] = useState(
    comparableTests[0]?.testCaseId ?? "",
  );
  const [policyVersion, setPolicyVersion] = useState(policies[0]?.version ?? "");
  const [comparison, setComparison] = useState<ArchiveComparison | null>(null);
  const [temporal, setTemporal] = useState<ArchiveTemporalComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comparisonReferenceRun =
    comparison?.rows.find((row) => row.latestRun)?.latestRun ?? null;

  const selectedModels = useMemo(
    () => catalog.models.filter((model) => modelIds.includes(model.id)),
    [catalog.models, modelIds],
  );

  function toggleModel(modelId: string): void {
    setComparison(null);
    setTemporal(null);
    setError(null);
    setModelIds((current) => {
      if (current.includes(modelId)) {
        return current.filter((id) => id !== modelId);
      }
      if (current.length >= 4) return current;
      return [...current, modelId];
    });
  }

  async function handleCompare(): Promise<void> {
    if (modelIds.length < 2 || !testCaseId) return;

    setBusy(true);
    setError(null);
    try {
      const [result, history] = await Promise.all([
        compareArchive({
          data: {
            modelIds,
            testCaseId,
            ...(policyVersion ? { policyVersion } : {}),
          },
        }),
        compareArchiveHistory({
          data: {
            modelIds,
            testCaseId,
          },
        }),
      ]);
      setComparison(result);
      setTemporal(history);
      if (!result || !history) {
        setError("No public Archive comparison exists for this selection.");
      }
    } catch (caught) {
      setComparison(null);
      setTemporal(null);
      setError(caught instanceof Error ? caught.message : "Comparison failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">M</span>
          <span>
            <strong>Modelapse</strong>
            <small>AI Model Test & Evolution Archive</small>
          </span>
        </a>
        <nav className="header-nav">
          <a className="header-link" href="/#archive">Archive</a>
          <span className="header-link header-link-current">Compare</span>
        </nav>
      </header>

      <section className="entity-hero compare-hero">
        <div className="run-breadcrumb">
          <a href="/#archive">Archive</a>
          <span>/</span>
          <span>Compare</span>
        </div>

        <div className="run-title-row">
          <div>
            <p className="eyebrow">TEMPORAL COMPARISON</p>
            <h1>Same Test. Latest view + history.</h1>
            <p className="run-subtitle">
              Compare 2–4 canonical models against one public Test Case, then inspect
              each model’s sealed Run history without turning the Archive into a ranking table.
            </p>
          </div>
        </div>
      </section>

      <section className="section compare-controls-section">
        <div className="compare-controls">
          <label>
            <span>01 / Public Test</span>
            <select
              value={testCaseId}
              onChange={(event) => {
                setTestCaseId(event.target.value);
                setComparison(null);
                setTemporal(null);
                setError(null);
              }}
            >
              {comparableTests.map((test) => (
                <option key={test.testCaseId} value={test.testCaseId}>
                  {test.familyName} · {test.caseSlug} · v{test.version}
                </option>
              ))}
            </select>
            <small>
              Latest comparison and temporal lanes use this exact public Test Case.
            </small>
          </label>
          <label>
            <span>Comparability policy</span>
            <select
              value={policyVersion}
              onChange={(event) => {
                setPolicyVersion(event.target.value);
                setComparison(null);
                setTemporal(null);
                setError(null);
              }}
            >
              {policies.map((policy) => (
                <option key={policy.id} value={policy.version}>
                  {policy.version} · E{policy.minimumEvidenceLevel.slice(1)}+
                </option>
              ))}
            </select>
            <small>
              Versioned eligibility rules, not a model score. Earlier policy versions
              remain selectable for re-evaluating historical Runs.
            </small>
          </label>

          <div className="model-picker">
            <span>02 / Models</span>
            <div className="model-picker-grid">
              {catalog.models.map((model) => {
                const selected = modelIds.includes(model.id);
                return (
                  <label
                    className={selected ? "model-choice model-choice-selected" : "model-choice"}
                    key={model.id}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleModel(model.id)}
                      disabled={!selected && modelIds.length >= 4}
                    />
                    <strong>{model.marketingName}</strong>
                    <small>{model.provider.slug} · {model.canonicalSlug}</small>
                  </label>
                );
              })}
            </div>
            <small>{modelIds.length} / 4 selected · minimum 2</small>
          </div>
        </div>

        <div className="compare-action">
          <div>
            <strong>
              {selectedModels.map((model) => model.marketingName).join(" ↔ ") || "Select models"}
            </strong>
            <small>No winner, score aggregation, or ordering is computed.</small>
          </div>
          <button
            type="button"
            disabled={busy || modelIds.length < 2 || !testCaseId}
            onClick={() => void handleCompare()}
          >
            {busy ? "Comparing…" : "Compare latest + history"}
          </button>
        </div>

        {error ? <div className="notice notice-error">{error}</div> : null}
      </section>

      <section className="section entity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SIDE BY SIDE</p>
            <h2>
              {comparison
                ? `${comparison.test.familyName} · ${comparison.test.caseSlug}`
                : "Select models and run comparison"}
            </h2>
          </div>
          {comparison ? (
            <a
              className="text-link"
              href={`/tests/${comparison.test.testCaseId}`}
            >
              Inspect Test →
            </a>
          ) : null}
          <p className="section-note">
            Comparability is evaluated under a versioned policy. Calibration
            canaries are service-health evidence, not leaderboard scores or a
            degradation verdict.
          </p>
        </div>

        {comparison ? (
          <>
            <div className="notice">
              <strong>
                Comparability {comparison.comparabilitySet.status}
                {" · "}
                {comparison.policy.version}
              </strong>
              <span>
                {comparison.comparabilitySet.reasons.length > 0
                  ? comparison.comparabilitySet.reasons.join(" · ")
                  : "All selected latest Runs satisfy this policy. This is not a quality ranking."}
              </span>
            </div>
            <div className="comparison-grid">
            {comparison.rows.map((row) => {
              const run = row.latestRun;
              return (
                <article className="comparison-card" key={row.model.id}>
                  <div className="comparison-card-head">
                    <span>{row.model.provider.slug}</span>
                    <a href={`/models/${row.model.id}`}>
                      {row.model.marketingName}
                    </a>
                    <small>{row.model.canonicalSlug}</small>
                  </div>

                  {run ? (
                    <>
                      <div className="comparison-verdict">
                        <span className={evaluationClass(run)}>
                          {evaluationLabel(run)}
                        </span>
                        <span className="badge">evidence {run.evidenceLevel ?? "—"}</span>
                        <span className="badge">
                          comparability {row.comparability?.status ?? "unknown"}
                        </span>
                        <span className="badge">
                          context {contextRelation(run, comparisonReferenceRun)}
                        </span>
                      </div>
                      <dl className="comparison-facts">
                        <div>
                          <dt>Run</dt>
                          <dd>
                            <a className="text-link" href={`/runs/${run.id}`}>
                              {run.id.slice(0, 8)} →
                            </a>
                          </dd>
                        </div>
                        <div>
                          <dt>Completed</dt>
                          <dd>{formatTimestamp(run.completedAt)}</dd>
                        </div>
                        <div>
                          <dt>Requested</dt>
                          <dd>{run.requestedModel}</dd>
                        </div>
                        <div>
                          <dt>Returned</dt>
                          <dd>{run.returnedModel ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Execution</dt>
                          <dd>{run.executionPath}</dd>
                        </div>
                        <div>
                          <dt>Region / account</dt>
                          <dd>
                            {run.executionQualification?.executionRegion ?? "unknown"}
                            {" · "}
                            {run.executionQualification?.accountTier ?? "unknown"}
                          </dd>
                        </div>
                        <div>
                          <dt>Service / assurance</dt>
                          <dd>
                            {run.executionQualification?.returnedServiceTier ??
                              run.executionQualification?.serviceTier ??
                              "unknown"}
                            {" · "}
                            {run.executionQualification?.serviceAssurance ??
                              "unknown"}
                          </dd>
                        </div>
                        <div>
                          <dt>Evaluator</dt>
                          <dd>
                            {run.evaluation
                              ? `${run.evaluation.evaluatorSlug}@${run.evaluation.evaluatorVersion}`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Replication</dt>
                          <dd>
                            {row.comparability
                              ? `${row.comparability.repeatCount}/${row.comparability.requiredRepeatCount}`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>Calibration</dt>
                          <dd>
                            {row.comparability?.calibration
                              ? `${row.comparability.calibration.status} · streak ${row.comparability.calibration.anomalyStreak}`
                              : "not observed"}
                          </dd>
                        </div>
                      </dl>
                      {row.comparability?.reasons.length ? (
                        <p className="section-note">
                          Comparability: {row.comparability.reasons.join(" · ")}
                        </p>
                      ) : null}
                      <p className="section-note">
                        Execution caveats:{" "}
                        {run.executionQualification
                          ? run.executionQualification.caveats.join(" · ") || "none reported"
                          : "qualification unavailable"}
                      </p>
                      <p className="section-note">
                        Cost caveats:{" "}
                        {run.cost
                          ? run.cost.caveats.join(" · ") || "none reported"
                          : "cost evidence unavailable"}
                      </p>
                    </>
                  ) : (
                    <div className="comparison-empty">
                      No sealed public Run exists for this model × Test Case pair.
                    </div>
                  )}
                </article>
              );
            })}
            </div>
          </>
        ) : (
          <div className="comparison-placeholder">
            <p>
              Comparison intentionally uses raw Archive records. It does not infer
              an overall model winner from heterogeneous Tests.
            </p>
          </div>
        )}
      </section>

      <section className="section entity-section temporal-compare-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SAME-TEST HISTORY</p>
            <h2>
              {temporal
                ? `${temporal.test.caseSlug} across capture time`
                : "Temporal lanes appear after comparison"}
            </h2>
          </div>
          <p className="section-note">
            Every lane is ordered by capture time. Result changes are displayed as observations,
            not as an inferred trend, winner, or cause.
          </p>
        </div>

        {temporal ? (
          <div className="temporal-lanes">
            {temporal.rows.map((row) => (
              <article className="temporal-lane" key={row.model.id}>
                <header>
                  <div>
                    <span>{row.model.provider.slug}</span>
                    <a href={`/models/${row.model.id}`}>{row.model.marketingName}</a>
                    <small>{row.model.canonicalSlug}</small>
                  </div>
                  <a
                    className="text-link"
                    href={`/history/${row.model.id}/${temporal.test.testCaseId}`}
                  >
                    Full history →
                  </a>
                </header>

                <div className="temporal-track">
                  {row.runs.map((run, index) => (
                    <a
                      className="temporal-point"
                      href={`/runs/${run.id}`}
                      key={run.id}
                    >
                      <span className="temporal-point-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <strong>{formatTimestamp(run.completedAt ?? run.sealedAt)}</strong>
                      <span className={evaluationClass(run)}>{evaluationLabel(run)}</span>
                      <small>
                        {run.evidenceLevel ?? "—"} · {run.returnedModel ?? run.requestedModel}
                        {" · "}
                        context {row.contextTransitions[index]?.status ?? "unknown"}
                      </small>
                      {row.contextTransitions[index]?.changes.map((change) => (
                        <small key={change.field}>
                          {change.kind} · {change.field.replaceAll("_", " ")}:
                          {" "}{change.previous} → {change.current}
                        </small>
                      ))}
                      {row.contextTransitions[index]?.unknownFields.length ? (
                        <small>
                          Unknown: {row.contextTransitions[index]?.unknownFields.join(", ")}
                        </small>
                      ) : null}
                      {row.contextTransitions[index]?.caveats.length ? (
                        <small>
                          Caveats: {row.contextTransitions[index]?.caveats.join(" · ")}
                        </small>
                      ) : null}
                    </a>
                  ))}
                  {row.runs.length === 0 ? (
                    <div className="temporal-empty">
                      No sealed public Run for this model × Test Case pair.
                    </div>
                  ) : null}
                </div>

                <div className="temporal-lane-foot">
                  <span>{row.runs.length} Run(s)</span>
                  <span>{row.relations.length} explicit relation(s)</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="comparison-placeholder">
            <p>
              Select one Test and 2–4 models to inspect both the latest sealed record
              and the sequence of earlier sealed Runs for the same exact Test.
            </p>
          </div>
        )}
      </section>

      <footer>
        <span>Modelapse · Comparison</span>
        <a className="text-link" href="/#archive">Back to Archive ↑</a>
      </footer>
    </main>
  );
}
