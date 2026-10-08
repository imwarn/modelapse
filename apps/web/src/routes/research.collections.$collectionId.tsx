import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  downloadResearchCollection,
  getArchiveComparabilityPolicies,
  getResearchCollection,
  getResearchCollectionAssessment,
  type ArchiveResearchPolicyAssessment,
} from "../modelapse";

export const Route = createFileRoute("/research/collections/$collectionId")({
  loader: async ({ params }) => {
    const [collection, policies] = await Promise.all([
      getResearchCollection({ data: { collectionId: params.collectionId } }),
      getArchiveComparabilityPolicies(),
    ]);
    return { collection, policies };
  },
  component: ResearchCollectionDetailPage,
});

function ResearchCollectionDetailPage() {
  const { collection, policies } = Route.useLoaderData();
  const [policyVersion, setPolicyVersion] = useState(policies[0]?.version ?? "");
  const [assessment, setAssessment] =
    useState<ArchiveResearchPolicyAssessment | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  async function assessPolicy(): Promise<void> {
    if (!collection || !policyVersion) return;
    setAssessing(true);
    setAssessmentError(null);
    setAssessment(null);
    try {
      const result = await getResearchCollectionAssessment({
        data: { collectionId: collection.id, policyVersion },
      });
      if (result.manifestSha256 !== collection.contentSha256) {
        throw new Error("Research manifest changed during assessment");
      }
      setAssessment(result.assessment);
    } catch (caught) {
      setAssessmentError(
        caught instanceof Error ? caught.message : "Assessment unavailable",
      );
    } finally {
      setAssessing(false);
    }
  }
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportSnapshot(format: "csv" | "json"): Promise<void> {
    if (!collection) return;
    setExporting(format);
    setError(null);
    try {
      const result = await downloadResearchCollection({
        data: { collectionId: collection.id, format },
      });
      const blob = new Blob([result.body], { type: result.mediaType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">M</span>
          <span><strong>Modelapse</strong><small>AI Model Test &amp; Evolution Archive</small></span>
        </a>
        <nav className="header-nav">
          <a className="header-link" href="/research">Research</a>
          <a className="header-link" href="/research/collections">Collections</a>
        </nav>
      </header>
      <section className="entity-hero">
        <div className="run-breadcrumb">
          <a href="/research">Research</a><span>/</span>
          <a href="/research/collections">Collections</a><span>/</span>
          <span>{collection?.id.slice(0, 8) ?? "Unknown"}</span>
        </div>
        <p className="eyebrow">ARCHIVE v0.27 · FROZEN EVIDENCE SET</p>
        <h1>{collection?.title ?? "Research collection not found"}</h1>
        <p className="run-subtitle">
          {collection?.description ??
            "The collection manifest records exact sealed Run identities, not an automatically refreshing query."}
        </p>
      </section>
      {collection ? (
        <>
          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">REPRODUCIBILITY</p><h2>Manifest &amp; exports</h2></div>
              <span className="badge">{collection.runIds.length} captured Runs</span>
            </div>
            <p className="section-note">
              Captured {collection.createdAt} · scope: sealed public non-calibration
              · selection limit {collection.selectionLimit}. The manifest stays unchanged
              when newer Runs arrive. Comparability and calibration eligibility have
              not been evaluated for this collection.
            </p>
            <p className="section-note">SHA-256 manifest: <code>{collection.contentSha256}</code></p>
            <p className="section-note">
              Frozen filters: <code>{JSON.stringify(collection.filters)}</code>
            </p>
            <div className="compare-action">
              <button type="button" disabled={exporting !== null}
                onClick={() => void exportSnapshot("json")}>
                {exporting === "json" ? "Exporting…" : "Download sourced JSON"}
              </button>
              <button type="button" disabled={exporting !== null}
                onClick={() => void exportSnapshot("csv")}>
                {exporting === "csv" ? "Exporting…" : "Download CSV"}
              </button>
              <a className="text-link" href={`/research?${new URLSearchParams(
                Object.entries(collection.filters)
                  .filter(([, value]) => typeof value === "string")
                  .map(([key, value]) => [
                    key === "providerSlug" ? "provider" : key, String(value),
                  ] as [string, string]),
              ).toString()}`}>Re-run these filters (live) →</a>
            </div>
            {error ? <div className="notice notice-error">{error}</div> : null}
          </section>
          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ARCHIVE v0.28 · POLICY-AWARE ANNOTATIONS</p>
                <h2>Reassess frozen Runs with a versioned policy</h2>
              </div>
              <span className="badge">derived · not stored in manifest</span>
            </div>
            <p className="section-note">
              This applies the chosen immutable comparability-policy version
              to every captured Run individually, using its historical execution
              context, prior calibration evidence and replication available at the
              time of that Run. It does not declare this collection a matched
              cross-Provider set. A later policy interpretation never changes
              captured membership or the SHA-256 manifest.
            </p>
            <div className="control-grid">
              <label>
                <span>Comparability Policy version</span>
                <select value={policyVersion} onChange={(event) => {
                  setPolicyVersion(event.target.value);
                  setAssessment(null);
                }}>
                  {policies.map((policy) => (
                    <option value={policy.version} key={policy.id}>
                      {policy.version} · evidence {policy.minimumEvidenceLevel}+
                    </option>
                  ))}
                </select>
              </label>
              <div className="run-action">
                <button type="button" disabled={!policyVersion || assessing}
                  onClick={() => void assessPolicy()}>
                  {assessing ? "Assessing…" : "Assess frozen Runs"}
                </button>
              </div>
            </div>
            {assessmentError ? <div className="notice notice-error">{assessmentError}</div> : null}
            {assessment ? (
              <div className="integrity-list">
                <p className="section-note">
                  Policy {assessment.policy.version} · {assessment.collectionRunCount} Run(s)
                  · scope: individual eligibility only, not matched cross-Provider comparison.
                  Results are derived at request time.
                </p>
                {assessment.rows.map((entry) => (
                  <article className="integrity-row" key={entry.runId}>
                    <div className="integrity-title-line">
                      <a className="text-link" href={`/runs/${entry.runId}`}>
                        Run {entry.runId.slice(0, 8)} →
                      </a>
                      <span className="badge">{entry.comparability.status}</span>
                    </div>
                    <p>
                      Replication {entry.comparability.repeatCount} /
                      {" "}{entry.comparability.requiredRepeatCount}
                      {" · "}Prior calibration{" "}
                      {entry.comparability.calibration?.status ?? "unknown"}
                    </p>
                    <p className="section-note">
                      {entry.comparability.reasons.length
                        ? entry.comparability.reasons.join(" · ")
                        : "No per-Run blockers under this policy; collection-level matching not checked."}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">CAPTURED SOURCE RECORDS</p><h2>Run evidence</h2></div>
            </div>
            <div className="integrity-list">
              {collection.runs.map((run) => (
                <article className="integrity-row" key={run.id}>
                  <div className="integrity-title-line">
                    <strong>{run.provider.name} · {run.model.marketingName ?? run.requestedModel}</strong>
                    <span className="badge">{run.evidenceLevel ?? "unknown evidence"}</span>
                  </div>
                  <p>
                    {run.test.familySlug}/{run.test.caseSlug} · {run.executionPath}
                    {" · "}region {run.executionQualification?.executionRegion ?? "unknown"}
                    {" · "}account {run.executionQualification?.accountTier ?? "unknown"}
                    {" · "}tier {run.executionQualification?.returnedServiceTier ??
                      run.executionQualification?.serviceTier ?? "unknown"}
                  </p>
                  <p>
                    Pricing {run.cost?.estimatedNativeCost ?? "unknown (not free)"}
                    {" "}{run.cost?.pricing?.currency ?? ""}
                    {" · "}Qualification caveats: {run.executionQualification?.caveats.join(" · ") ||
                      "unknown/none reported"}
                    {" · "}Cost caveats: {run.cost?.caveats.join(" · ") ||
                      "unknown/none reported"}
                  </p>
                  <a className="text-link" href={`/runs/${run.id}`}>Verify Run →</a>
                  {" · "}
                  {run.model.id ? <a className="text-link" href={`/history/${run.model.id}/${run.test.testCaseId}`}>History →</a> : null}
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className="section"><div className="empty-state">No public research collection exists for this ID.</div></section>
      )}
      <footer><span>Modelapse · Frozen Research Snapshot</span><a className="text-link" href="/research/collections">All collections ↑</a></footer>
    </main>
  );
}
