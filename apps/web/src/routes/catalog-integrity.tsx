import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getCatalogIntegrity,
  type CatalogIntegrityCategory,
  type CatalogIntegrityDashboard,
} from "../modelapse";

export const Route = createFileRoute("/catalog-integrity")({
  component: CatalogIntegrity,
});

const CATEGORY_LABELS: Readonly<Record<CatalogIntegrityCategory, string>> = {
  collection_failed: "Collection failed",
  collection_partial: "Collection partial",
  collection_stale: "Collection stale",
  discovery_unresolved: "Discovery unresolved",
  promotion_ready: "Promotion ready",
  promotion_blocked: "Promotion blocked",
  drift_open: "Drift open",
  drift_acknowledged: "Drift acknowledged",
  provenance_incomplete: "Provenance incomplete",
};

function stamp(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : "—";
}

function CatalogIntegrity() {
  const [operatorToken, setOperatorToken] = useState("");
  const [dashboard, setDashboard] = useState<CatalogIntegrityDashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!operatorToken) return;
    setBusy(true);
    setError(null);
    try {
      setDashboard(await getCatalogIntegrity({ data: { operatorToken } }));
    } catch (cause) {
      setDashboard(null);
      setError(cause instanceof Error ? cause.message : "Catalog integrity request failed");
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
            <small>Catalog Integrity</small>
          </span>
        </a>
        <nav className="integrity-nav" aria-label="Catalog workflows">
          <a href="/catalog-coverage">Coverage Matrix</a>
          <a href="/catalog-presence-review">Presence Review</a>
          <a href="/catalog-inbox">Catalog Inbox</a>
          <a href="/identity-review">Identity Review</a>
        </nav>
      </header>

      <section className="hero integrity-hero">
        <div>
          <p className="eyebrow">OPERATOR / ARCHIVE v0.13</p>
          <h1>
            Attention is derived.
            <br />
            Decisions stay explicit.
          </h1>
          <p className="hero-copy">
            One read-only queue over collection health, discovery, identity drift,
            and provenance. Every signal points back to an existing workflow; this
            dashboard never promotes, reconciles, resolves, retires, or rewrites identity.
          </p>
        </div>
        <div className="hero-stats" aria-label="Catalog integrity summary">
          <div>
            <strong>{dashboard?.summary.total ?? "—"}</strong>
            <span>attention items</span>
          </div>
          <div>
            <strong>{dashboard?.observerSources.length ?? "—"}</strong>
            <span>observer sources</span>
          </div>
          <div>
            <strong>{dashboard ? stamp(dashboard.generatedAt) : "locked"}</strong>
            <span>projection time</span>
          </div>
        </div>
      </section>

      <section className="section control-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACCESS</p>
            <h2>Load integrity projection</h2>
          </div>
          <span className={dashboard ? "badge badge-pass" : "badge"}>
            {dashboard ? "read-only snapshot loaded" : "operator locked"}
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
            <small>The browser never receives the API control token.</small>
          </label>
          <div className="run-action">
            <button type="button" disabled={busy || !operatorToken} onClick={() => void load()}>
              {busy ? "Loading projection…" : dashboard ? "Refresh projection" : "Load attention queue"}
            </button>
          </div>
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      {dashboard ? (
        <>
          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">SUMMARY</p>
                <h2>Operational categories</h2>
              </div>
              <span className="badge">{dashboard.summary.total} total</span>
            </div>
            <div className="integrity-summary-grid">
              {(Object.entries(dashboard.summary.counts) as [CatalogIntegrityCategory, number][]).map(
                ([category, count]) => (
                  <article className={count > 0 ? "integrity-count active" : "integrity-count"} key={category}>
                    <strong>{count}</strong>
                    <span>{CATEGORY_LABELS[category]}</span>
                  </article>
                ),
              )}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">COLLECTION</p>
                <h2>Catalog Observer health</h2>
              </div>
              <span className="badge">{dashboard.observerSources.length} sources</span>
            </div>
            <div className="integrity-list">
              {dashboard.observerSources.map((source) => (
                <article className="integrity-row" key={source.id}>
                  <div>
                    <div className="integrity-title-line">
                      <strong>{source.provider.name} · {source.title}</strong>
                      <span className={source.attentionCategory ? "badge badge-fail" : "badge badge-pass"}>
                        {source.health.replaceAll("_", " ")}
                      </span>
                    </div>
                    <p>{source.sourceKind} · {source.sourceKey} · every {source.intervalSeconds}s</p>
                  </div>
                  <dl className="integrity-facts">
                    <dt>Enabled</dt><dd>{source.enabled ? "yes" : "no"}</dd>
                    <dt>Last attempted</dt><dd>{stamp(source.lastAttemptedAt)}</dd>
                    <dt>Last succeeded</dt><dd>{stamp(source.lastSucceededAt)}</dd>
                    <dt>Next run</dt><dd>{stamp(source.nextRunAt)}</dd>
                    <dt>Latest run</dt>
                    <dd>
                      {source.latestRun
                        ? source.latestRun.status +
                          " · HTTP " +
                          (source.latestRun.httpStatus ?? "—") +
                          " · " +
                          (source.latestRun.itemCount ?? "—") +
                          " items"
                        : "—"}
                    </dd>
                  </dl>
                  <a className="text-link" href={source.url} target="_blank" rel="noreferrer">
                    Open first-party source ↗
                  </a>
                </article>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">DISCOVERY</p>
                <h2>Candidate attention</h2>
              </div>
              <a className="text-link" href="/catalog-inbox">Open Catalog Inbox →</a>
            </div>
            <div className="integrity-list">
              {dashboard.discovery.map((item) => (
                <article className="integrity-row" key={item.candidateId}>
                  <div className="integrity-title-line">
                    <strong>{item.remoteModelId}</strong>
                    <span className={item.attentionCategory === "promotion_ready" ? "badge badge-pass" : "badge badge-fail"}>
                      {CATEGORY_LABELS[item.attentionCategory]}
                    </span>
                  </div>
                  <p>{item.provider.name} · observed {item.observationCount}× · latest {stamp(item.lastSeenAt)}</p>
                  <dl className="integrity-facts">
                    <dt>Snapshot</dt><dd>{item.latestProviderSnapshotId ?? "—"}</dd>
                    <dt>Source</dt><dd>{item.latestFirstPartySource.title ?? item.latestFirstPartySource.url ?? "—"}</dd>
                    <dt>SHA-256</dt><dd>{shortSha(item.latestFirstPartySource.contentSha256)}</dd>
                    <dt>Policy</dt><dd>{item.promotionPolicy.version}</dd>
                    <dt>Blockers</dt><dd>{item.promotionPolicy.blockers.length ? item.promotionPolicy.blockers.join(", ") : "none"}</dd>
                  </dl>
                  <a className="text-link" href="/catalog-inbox">Review candidate in Catalog Inbox →</a>
                </article>
              ))}
              {dashboard.discovery.length === 0 ? <p className="empty-state">No discovery or promotion attention.</p> : null}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">IDENTITY DRIFT</p>
                <h2>Review attention</h2>
              </div>
              <a className="text-link" href="/identity-review">Open Identity Review →</a>
            </div>
            <div className="integrity-list">
              {dashboard.drift.map((item) => (
                <article className="integrity-row" key={item.eventId}>
                  <div className="integrity-title-line">
                    <strong>{item.model?.marketingName ?? item.alias ?? item.eventId}</strong>
                    <span className="badge badge-fail">{CATEGORY_LABELS[item.attentionCategory]}</span>
                  </div>
                  <p>{item.provider.name} · {item.changeType} · {stamp(item.occurredAt)}</p>
                  <dl className="integrity-facts">
                    <dt>Changed fields</dt><dd>{item.changedFields.join(", ")}</dd>
                    <dt>API identity</dt><dd>{item.previousApiModelId ?? "—"} → {item.currentApiModelId ?? "—"}</dd>
                    <dt>Evidence</dt><dd>{item.evidenceSource?.title ?? item.evidenceSource?.url ?? "—"}</dd>
                  </dl>
                  <div className="integrity-links">
                    <a className="text-link" href="/identity-review">Review drift →</a>
                    {item.model ? (
                      <a className="text-link" href={"/identity-cases/" + item.model.id}>
                        Open Identity Case →
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
              {dashboard.drift.length === 0 ? <p className="empty-state">No open or acknowledged identity drift.</p> : null}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PROVENANCE</p>
                <h2>Canonical identity health</h2>
              </div>
              <span className="badge">{dashboard.provenance.length} incomplete</span>
            </div>
            <div className="integrity-list">
              {dashboard.provenance.map((item) => (
                <article className="integrity-row" key={item.model.id}>
                  <div className="integrity-title-line">
                    <strong>{item.model.marketingName}</strong>
                    <span className="badge badge-fail">provenance incomplete</span>
                  </div>
                  <p>{item.model.provider.name} · {item.model.canonicalSlug}</p>
                  <dl className="integrity-facts">
                    <dt>Reasons</dt><dd>{item.reasons.join(", ")}</dd>
                    <dt>Canonical source</dt><dd>{item.canonicalSource?.title ?? item.canonicalSource?.url ?? "—"}</dd>
                    <dt>Current binding</dt>
                    <dd>
                      {item.currentBinding
                        ? item.currentBinding.apiModelId + " @ " + item.currentBinding.endpointHostname
                        : "—"}{" "}
                      ({item.currentBindingCount})
                    </dd>
                    <dt>Promotion audit</dt>
                    <dd>
                      {item.promotionAudit
                        ? item.promotionAudit.policyVersion + " · " + stamp(item.promotionAudit.promotedAt)
                        : "not promotion-created"}
                    </dd>
                  </dl>
                  <a className="text-link" href={"/identity-cases/" + item.model.id}>
                    Open Identity Case →
                  </a>
                </article>
              ))}
              {dashboard.provenance.length === 0 ? (
                <p className="empty-state">All canonical Models have the required provenance links.</p>
              ) : null}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
