import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getCatalogProviderCoverage,
  type CatalogCoverageDisposition,
  type CatalogProviderCoverage,
} from "../modelapse";

export const Route = createFileRoute("/catalog-coverage/$providerId")({
  component: CatalogCoverageProvider,
});

const DISPOSITION_LABELS: Readonly<Record<CatalogCoverageDisposition, string>> = {
  canonical_observed: "Canonical observed",
  candidate_discovered: "Candidate discovered",
  candidate_promotion_ready: "Promotion ready",
  candidate_ignored: "Candidate ignored",
  candidate_matched: "Candidate matched",
};

function stamp(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : "—";
}

function CatalogCoverageProvider() {
  const { providerId } = Route.useParams();
  const [operatorToken, setOperatorToken] = useState("");
  const [coverage, setCoverage] = useState<CatalogProviderCoverage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!operatorToken) return;
    setBusy(true);
    setError(null);
    try {
      setCoverage(await getCatalogProviderCoverage({ data: { operatorToken, providerId } }));
    } catch (cause) {
      setCoverage(null);
      setError(cause instanceof Error ? cause.message : "Provider coverage request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/catalog-coverage" aria-label="Provider coverage">
          <span className="brand-mark">M</span>
          <span><strong>Modelapse</strong><small>Provider Coverage Detail</small></span>
        </a>
        <nav className="integrity-nav">
          <a href="/catalog-coverage">All providers</a>
          <a href={"/catalog-presence/" + providerId}>Presence timeline</a>
          <a href="/catalog-integrity">Integrity</a>
          <a href="/catalog-inbox">Catalog Inbox</a>
        </nav>
      </header>

      <section className="section control-section coverage-detail-access">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ARCHIVE v0.14</p>
            <h1 className="coverage-detail-title">
              {coverage ? coverage.provider.name : "Provider catalog coverage"}
            </h1>
          </div>
          <span className={coverage ? "badge badge-pass" : "badge"}>
            {coverage ? "evidence projection loaded" : "operator locked"}
          </span>
        </div>
        <div className="control-grid integrity-access-grid">
          <label>
            <span>Operator access</span>
            <input
              type="password"
              value={operatorToken}
              onChange={(event) => setOperatorToken(event.target.value)}
              placeholder="MODELAPSE_WEB_OPERATOR_TOKEN"
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
          <div className="run-action">
            <button type="button" disabled={busy || !operatorToken} onClick={() => void load()}>
              {busy ? "Loading…" : "Load coverage detail"}
            </button>
          </div>
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      {coverage ? (
        <>
          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">SUMMARY</p><h2>Latest evidence coverage</h2></div>
              <span className="badge">projected {stamp(coverage.generatedAt)}</span>
            </div>
            <div className="integrity-summary-grid coverage-summary-grid">
              <article className="integrity-count"><strong>{coverage.summary.sourceItemCount}</strong><span>source items</span></article>
              <article className="integrity-count"><strong>{coverage.summary.uniqueProjectedRemoteIds}</strong><span>projected remote IDs</span></article>
              <article className="integrity-count"><strong>{coverage.summary.canonicalObserved}</strong><span>canonical observed</span></article>
              <article className="integrity-count"><strong>{coverage.summary.candidateDiscovered}</strong><span>candidate discovered</span></article>
              <article className="integrity-count"><strong>{coverage.summary.candidatePromotionReady}</strong><span>promotion ready</span></article>
              <article className="integrity-count"><strong>{coverage.summary.candidateIgnored}</strong><span>candidate ignored</span></article>
              <article className="integrity-count"><strong>{coverage.summary.candidateMatched}</strong><span>candidate matched</span></article>
              <article className={coverage.summary.unprojectedSourceItems ? "integrity-count active" : "integrity-count"}>
                <strong>{coverage.summary.unprojectedSourceItems}</strong><span>unprojected source items</span>
              </article>
              <article className={coverage.summary.currentBindingsNotObserved ? "integrity-count active" : "integrity-count"}>
                <strong>{coverage.summary.currentBindingsNotObserved}</strong><span>current bindings not observed</span>
              </article>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">MODEL LIST SOURCES</p><h2>Evidence-backed snapshots</h2></div>
              <span className="badge">{coverage.summary.sourcesWithEvidence}/{coverage.summary.modelListSources} with evidence</span>
            </div>
            <div className="integrity-list">
              {coverage.sources.map((source) => (
                <article className="integrity-row" key={source.id}>
                  <div className="integrity-title-line">
                    <strong>{source.title}</strong>
                    <span className={source.latestEvidence ? "badge badge-pass" : "badge badge-fail"}>
                      {source.latestEvidence ? source.latestEvidence.status : "no evidence"}
                    </span>
                  </div>
                  <p>{source.sourceKey} · {source.enabled ? "enabled" : "disabled"}</p>
                  <dl className="integrity-facts">
                    <dt>Latest attempt</dt><dd>{source.latestAttempt ? source.latestAttempt.status + " · " + stamp(source.latestAttempt.startedAt) : "—"}</dd>
                    <dt>Evidence retrieved</dt><dd>{stamp(source.latestEvidence?.source.retrievedAt ?? null)}</dd>
                    <dt>Source items</dt><dd>{source.latestEvidence?.itemCount ?? "—"}</dd>
                    <dt>Projected</dt><dd>{source.latestEvidence?.projectedItemCount ?? "—"}</dd>
                    <dt>Unprojected</dt><dd>{source.latestEvidence?.unprojectedItemCount ?? "—"}</dd>
                    <dt>SHA-256</dt><dd>{shortSha(source.latestEvidence?.source.contentSha256 ?? null)}</dd>
                  </dl>
                  <a className="text-link" href={source.url} target="_blank" rel="noreferrer">Open first-party source ↗</a>
                </article>
              ))}
              {coverage.sources.length === 0 ? (
                <p className="empty-state">No model-list observer source is registered for this provider.</p>
              ) : null}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">REMOTE IDS</p><h2>Reconciliation matrix</h2></div>
              <a className="text-link" href="/catalog-inbox">Open Catalog Inbox →</a>
            </div>
            <div className="coverage-matrix">
              {coverage.remoteItems.map((item) => (
                <article className="coverage-matrix-row" key={item.remoteModelId}>
                  <div>
                    <strong>{item.remoteModelId}</strong>
                    <small>{item.observations.length} latest-source observation{item.observations.length === 1 ? "" : "s"}</small>
                  </div>
                  <span className={item.disposition === "canonical_observed" ? "badge badge-pass" : "badge"}>
                    {DISPOSITION_LABELS[item.disposition]}
                  </span>
                  <div className="coverage-matrix-links">
                    <a
                      className="text-link"
                      href={
                        "/catalog-remote-case/" +
                        providerId +
                        "?remoteModelId=" +
                        encodeURIComponent(item.remoteModelId)
                      }
                    >
                      Remote ID Case →
                    </a>
                    {item.canonicalModel ? (
                      <a className="text-link" href={"/identity-cases/" + item.canonicalModel.id}>
                        {item.canonicalModel.marketingName} → Identity Case
                      </a>
                    ) : null}
                    {item.candidate ? (
                      <a className="text-link" href="/catalog-inbox">
                        Candidate {item.candidate.status} → Inbox
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
              {coverage.remoteItems.length === 0 ? (
                <p className="empty-state">No reconstructable remote IDs in the latest evidence-backed model-list snapshots.</p>
              ) : null}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CURRENT BINDINGS NOT OBSERVED</p>
                <h2>Absence without retirement inference</h2>
              </div>
              <span className="badge">{coverage.currentBindingsNotObserved.length}</span>
            </div>
            <p className="section-intro">
              These are current first-party direct bindings whose API model ID is not present in the
              reconstructable latest model-list evidence. This is an observation gap only; it does not
              mark a Model retired or rewrite canonical identity.
            </p>
            <div className="integrity-list">
              {coverage.currentBindingsNotObserved.map((item) => (
                <article className="integrity-row" key={item.bindingId}>
                  <div className="integrity-title-line">
                    <strong>{item.apiModelId}</strong>
                    <span className="badge badge-fail">not observed</span>
                  </div>
                  <p>{item.model.marketingName} · {item.endpointHostname}</p>
                  <dl className="integrity-facts">
                    <dt>Binding source</dt><dd>{item.source.title ?? item.source.url ?? "—"}</dd>
                    <dt>Source retrieved</dt><dd>{stamp(item.source.retrievedAt)}</dd>
                    <dt>Interpretation</dt><dd>{item.interpretation.replaceAll("_", " ")}</dd>
                  </dl>
                  <div className="coverage-matrix-links">
                    <a
                      className="text-link"
                      href={
                        "/catalog-remote-case/" +
                        providerId +
                        "?remoteModelId=" +
                        encodeURIComponent(item.apiModelId)
                      }
                    >
                      Remote ID Case →
                    </a>
                    <a className="text-link" href={"/identity-cases/" + item.model.id}>Open Identity Case →</a>
                  </div>
                </article>
              ))}
              {coverage.currentBindingsNotObserved.length === 0 ? (
                <p className="empty-state">Every current first-party direct binding is represented in the latest reconstructable model-list evidence.</p>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
