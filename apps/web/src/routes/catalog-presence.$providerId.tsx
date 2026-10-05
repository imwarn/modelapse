import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getCatalogPresenceHistory,
  type CatalogPresenceEventKind,
  type CatalogPresenceHistory,
} from "../modelapse";

export const Route = createFileRoute("/catalog-presence/$providerId")({
  component: CatalogPresenceTimeline,
});

const EVENT_LABELS: Readonly<Record<CatalogPresenceEventKind, string>> = {
  appeared_in_complete_snapshot: "Appeared",
  not_observed_in_complete_snapshot: "Not observed",
  reobserved_in_complete_snapshot: "Reobserved",
};

function stamp(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function CatalogPresenceTimeline() {
  const { providerId } = Route.useParams();
  const [operatorToken, setOperatorToken] = useState("");
  const [history, setHistory] = useState<CatalogPresenceHistory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!operatorToken) return;
    setBusy(true);
    setError(null);
    try {
      setHistory(await getCatalogPresenceHistory({ data: { operatorToken, providerId } }));
    } catch (cause) {
      setHistory(null);
      setError(cause instanceof Error ? cause.message : "Catalog presence request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/catalog-coverage" aria-label="Provider coverage">
          <span className="brand-mark">M</span>
          <span><strong>Modelapse</strong><small>Catalog Presence Timeline</small></span>
        </a>
        <nav className="integrity-nav">
          <a href={"/catalog-coverage/" + providerId}>Coverage detail</a>
          <a href="/catalog-presence-review">Presence review</a>
          <a href="/catalog-integrity">Integrity</a>
          <a href="/catalog-inbox">Catalog Inbox</a>
        </nav>
      </header>

      <section className="hero integrity-hero presence-hero">
        <div>
          <p className="eyebrow">OPERATOR / ARCHIVE v0.15</p>
          <h1>
            Presence changes over time.
            <br />
            Absence stays evidence, not retirement.
          </h1>
          <p className="hero-copy">
            Compare complete, reconstructable provider model-list snapshots. Appearance,
            non-observation, and reappearance events are derived only when snapshot
            projection is complete; incomplete snapshots never create disappearance claims.
          </p>
        </div>
        <div className="hero-stats">
          <div><strong>{history?.summary.completeProjectionRuns ?? "—"}</strong><span>complete snapshots</span></div>
          <div><strong>{history?.summary.incompleteProjectionRuns ?? "—"}</strong><span>incomplete snapshots</span></div>
          <div><strong>{history ? stamp(history.summary.latestCompleteAt) : "locked"}</strong><span>latest complete</span></div>
        </div>
      </section>

      <section className="section control-section">
        <div className="section-heading">
          <div><p className="eyebrow">ACCESS</p><h2>Load presence history</h2></div>
          <span className={history ? "badge badge-pass" : "badge"}>
            {history ? "read-only timeline loaded" : "operator locked"}
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
            <small>Only the Web server receives the operator token; the API control token stays server-side.</small>
          </label>
          <div className="run-action">
            <button type="button" disabled={busy || !operatorToken} onClick={() => void load()}>
              {busy ? "Loading history…" : "Load presence timeline"}
            </button>
          </div>
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      {history ? (
        <>
          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">SUMMARY</p><h2>{history.provider.name} snapshot evolution</h2></div>
              <span className="badge">{history.summary.evidenceRuns} evidence runs</span>
            </div>
            <div className="integrity-summary-grid presence-summary-grid">
              <article className="integrity-count"><strong>{history.summary.appearanceEvents}</strong><span>appearance events</span></article>
              <article className="integrity-count"><strong>{history.summary.absenceEvents}</strong><span>not-observed events</span></article>
              <article className="integrity-count"><strong>{history.summary.reappearanceEvents}</strong><span>reappearance events</span></article>
              <article className="integrity-count"><strong>{history.summary.modelListSources}</strong><span>model-list sources</span></article>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">SNAPSHOTS</p><h2>Projection completeness</h2></div>
              <span className="badge">{history.runs.length} runs loaded</span>
            </div>
            <div className="presence-run-list">
              {[...history.runs].reverse().map((run) => (
                <article className="presence-run-row" key={run.runId}>
                  <div>
                    <strong>{run.sourceTitle}</strong>
                    <small>{stamp(run.source.retrievedAt)} · {run.status}</small>
                  </div>
                  <span className={run.completeProjection ? "badge badge-pass" : "badge badge-fail"}>
                    {run.completeProjection ? "complete projection" : "incomplete projection"}
                  </span>
                  <dl className="integrity-facts">
                    <dt>Items</dt><dd>{run.itemCount}</dd>
                    <dt>Projected</dt><dd>{run.projectedItemCount}</dd>
                    <dt>Diff eligible</dt><dd>{run.completeProjection ? "yes" : "no"}</dd>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">PRESENCE EVENTS</p><h2>Evidence-backed set transitions</h2></div>
              <span className="badge">{history.events.length} events</span>
            </div>
            <div className="timeline presence-timeline">
              {history.events.map((event) => (
                <article className="timeline-event presence-event" key={event.id}>
                  <div className="timeline-marker" />
                  <div className="timeline-time">{stamp(event.occurredAt)}</div>
                  <div className="timeline-body">
                    <strong>{event.remoteModelId}</strong>
                    <span className={event.kind === "not_observed_in_complete_snapshot" ? "badge badge-fail" : "badge badge-pass"}>
                      {EVENT_LABELS[event.kind]}
                    </span>
                    <small>{event.sourceKey} · {event.interpretation.replaceAll("_", " ")}</small>
                    <div className="presence-event-links">
                      {event.currentContext.canonicalModel ? (
                        <a className="text-link" href={"/identity-cases/" + event.currentContext.canonicalModel.id}>
                          Current Identity Case →
                        </a>
                      ) : null}
                      {event.currentContext.candidate ? (
                        <a className="text-link" href="/catalog-inbox">
                          Current Candidate: {event.currentContext.candidate.status} →
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
              {history.events.length === 0 ? (
                <p className="empty-state">No complete-snapshot presence transitions in the loaded history.</p>
              ) : null}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">INTERPRETATION</p><h2>What a gap does not mean</h2></div>
            </div>
            <p className="section-intro">
              “Not observed” means only that a remote ID present in the previous complete
              model-list snapshot was absent from the next complete reconstructable snapshot.
              Modelapse does not infer retirement, deprecation, invalidity, or provider intent.
              Incomplete snapshots are visible above but are excluded from absence/reappearance derivation.
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
