import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getCatalogCoverageProviders,
  type CatalogProviderCoverageSummary,
} from "../modelapse";

export const Route = createFileRoute("/catalog-coverage")({
  component: CatalogCoverageIndex,
});

function stamp(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function CatalogCoverageIndex() {
  const [operatorToken, setOperatorToken] = useState("");
  const [providers, setProviders] = useState<readonly CatalogProviderCoverageSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!operatorToken) return;
    setBusy(true);
    setError(null);
    try {
      setProviders(await getCatalogCoverageProviders({ data: { operatorToken } }));
    } catch (cause) {
      setProviders([]);
      setError(cause instanceof Error ? cause.message : "Catalog coverage request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Modelapse home">
          <span className="brand-mark">M</span>
          <span>
            <strong>Modelapse</strong>
            <small>Provider Catalog Coverage</small>
          </span>
        </a>
        <nav className="integrity-nav" aria-label="Catalog workflows">
          <a href="/catalog-integrity">Integrity</a>
          <a href="/catalog-inbox">Catalog Inbox</a>
          <a href="/identity-review">Identity Review</a>
        </nav>
      </header>

      <section className="hero integrity-hero coverage-hero">
        <div>
          <p className="eyebrow">OPERATOR / ARCHIVE v0.14</p>
          <h1>
            Coverage is evidence.
            <br />
            Absence is not retirement.
          </h1>
          <p className="hero-copy">
            Compare each provider&apos;s latest evidence-backed model-list snapshot with
            canonical identity observations, Candidate state, and current first-party
            bindings. No remote ID is promoted automatically and a missing ID is never
            interpreted as retired.
          </p>
        </div>
        <div className="hero-stats">
          <div><strong>{providers.length || "—"}</strong><span>providers</span></div>
          <div>
            <strong>{providers.reduce((sum, item) => sum + item.summary.uniqueProjectedRemoteIds, 0) || "—"}</strong>
            <span>projected remote IDs</span>
          </div>
          <div>
            <strong>{providers.reduce((sum, item) => sum + item.summary.currentBindingsNotObserved, 0) || "—"}</strong>
            <span>bindings not observed</span>
          </div>
        </div>
      </section>

      <section className="section control-section">
        <div className="section-heading">
          <div><p className="eyebrow">ACCESS</p><h2>Load provider matrix</h2></div>
          <span className={providers.length ? "badge badge-pass" : "badge"}>
            {providers.length ? "read-only coverage loaded" : "operator locked"}
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
            <small>The API control token remains server-side.</small>
          </label>
          <div className="run-action">
            <button type="button" disabled={busy || !operatorToken} onClick={() => void load()}>
              {busy ? "Loading coverage…" : "Load provider coverage"}
            </button>
          </div>
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      {providers.length ? (
        <section className="section">
          <div className="section-heading">
            <div><p className="eyebrow">PROVIDERS</p><h2>Latest model-list reconciliation</h2></div>
            <span className="badge">{providers.length} providers</span>
          </div>
          <div className="coverage-grid provider-coverage-grid">
            {providers.map((item) => (
              <a
                className="coverage-card provider-coverage-card"
                href={"/catalog-coverage/" + item.provider.id}
                key={item.provider.id}
              >
                <span>{item.provider.slug}</span>
                <strong>{item.provider.name}</strong>
                <small>latest evidence {stamp(item.latestEvidenceAt)}</small>
                <dl>
                  <dt>Sources</dt><dd>{item.summary.sourcesWithEvidence}/{item.summary.modelListSources}</dd>
                  <dt>Canonical</dt><dd>{item.summary.canonicalObserved}</dd>
                  <dt>Open candidates</dt><dd>{item.summary.candidateDiscovered + item.summary.candidatePromotionReady}</dd>
                  <dt>Ignored</dt><dd>{item.summary.candidateIgnored}</dd>
                  <dt>Unprojected</dt><dd>{item.summary.unprojectedSourceItems}</dd>
                  <dt>Binding absent</dt><dd>{item.summary.currentBindingsNotObserved}</dd>
                </dl>
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
