import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  downloadResearchCollection,
  getResearchCollection,
} from "../modelapse";

export const Route = createFileRoute("/research/collections/$collectionId")({
  loader: ({ params }) => getResearchCollection({
    data: { collectionId: params.collectionId },
  }),
  component: ResearchCollectionDetailPage,
});

function ResearchCollectionDetailPage() {
  const collection = Route.useLoaderData();
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
                  ]),
              ).toString()}`}>Re-run these filters (live) →</a>
            </div>
            {error ? <div className="notice notice-error">{error}</div> : null}
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
