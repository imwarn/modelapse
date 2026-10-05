import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getCatalogIdentityCase,
  type CatalogIdentityCase,
  type CatalogIdentityCaseSource,
} from "../modelapse";

export const Route = createFileRoute("/identity-cases/$modelId")({
  component: IdentityCasePage,
});

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function sourceHref(source: CatalogIdentityCaseSource | null): string | null {
  if (!source?.url) return null;
  try {
    const url = new URL(source.url);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function shortHash(value: string | null): string {
  return value ? value.slice(0, 16) : "—";
}

function IdentityCasePage() {
  const { modelId } = Route.useParams();
  const [operatorToken, setOperatorToken] = useState("");
  const [identityCase, setIdentityCase] = useState<CatalogIdentityCase | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!operatorToken) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getCatalogIdentityCase({
        data: { operatorToken, modelId },
      });
      setIdentityCase(result);
      setLoaded(true);
      if (!result) setError("Identity Case not found.");
    } catch (cause) {
      setIdentityCase(null);
      setLoaded(true);
      setError(cause instanceof Error ? cause.message : "Identity Case request failed");
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
            <small>Catalog Identity Case</small>
          </span>
        </a>
        <nav className="header-nav">
          <a className="header-link" href={"/models/" + modelId}>Public model archive</a>
          <a className="header-link" href="/catalog-inbox">Catalog Inbox</a>
          <a className="header-link" href="/identity-review">Identity Review</a>
        </nav>
      </header>

      <section className="hero inbox-hero">
        <div>
          <p className="eyebrow">OPERATOR / ARCHIVE v0.12</p>
          <h1>
            One identity.
            <br />
            Full decision history.
          </h1>
          <p className="hero-copy">
            Reconstruct discovery, reconciliation, promotion, source-backed drift,
            and review decisions from the existing immutable catalog records. This
            projection does not create or rewrite identity facts.
          </p>
        </div>
      </section>

      <section className="section control-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACCESS</p>
            <h2>Open Identity Case</h2>
          </div>
          <span className={identityCase ? "badge badge-pass" : "badge"}>
            {identityCase ? "case loaded" : "operator locked"}
          </span>
        </div>
        <div className="control-grid inbox-access-grid">
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
            <small>Actor names and operator notes stay behind the control boundary.</small>
          </label>
          <div className="run-action">
            <button type="button" disabled={busy || !operatorToken} onClick={() => void load()}>
              {busy ? "Loading…" : "Load Identity Case"}
            </button>
          </div>
        </div>
        {error ? <div className="notice notice-error">{error}</div> : null}
      </section>

      {identityCase ? (
        <>
          <section className="section entity-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CASE SUBJECT</p>
                <h2>{identityCase.model.marketingName}</h2>
              </div>
              <div className="run-verdict">
                <span className="badge badge-pass">{identityCase.model.status}</span>
                <span className="badge">{identityCase.model.provider.name}</span>
              </div>
            </div>
            <dl className="entity-stats">
              <div><dt>Canonical slug</dt><dd>{identityCase.model.canonicalSlug}</dd></div>
              <div><dt>Candidate histories</dt><dd>{identityCase.candidates.length}</dd></div>
              <div><dt>Identity drift</dt><dd>{identityCase.drift.length}</dd></div>
              <div><dt>Timeline events</dt><dd>{identityCase.timeline.length}</dd></div>
            </dl>
          </section>

          <section className="section entity-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">DISCOVERY & PROMOTION</p>
                <h2>Candidate histories</h2>
              </div>
              <p className="section-note">
                Historical matches remain visible even if a Candidate was later reopened or promoted elsewhere.
              </p>
            </div>
            <div className="coverage-grid">
              {identityCase.candidates.map((candidate) => (
                <article className="coverage-card identity-case-card" key={candidate.id}>
                  <span className="badge">{candidate.status}</span>
                  <strong>{candidate.remoteModelId}</strong>
                  <a
                    className="text-link"
                    href={
                      "/catalog-remote-case/" +
                      identityCase.model.provider.id +
                      "?remoteModelId=" +
                      encodeURIComponent(candidate.remoteModelId)
                    }
                  >
                    Open Remote ID Case →
                  </a>
                  <small>
                    {candidate.observationCount} observation(s) · {formatTimestamp(candidate.firstSeenAt)} → {formatTimestamp(candidate.lastSeenAt)}
                  </small>
                  <dl>
                    <div><dt>Observations</dt><dd>{candidate.observations.length}</dd></div>
                    <div><dt>Decisions</dt><dd>{candidate.decisions.length}</dd></div>
                  </dl>
                  {candidate.promotion ? (
                    <div className="notice">
                      Promoted {formatTimestamp(candidate.promotion.promotedAt)} by {candidate.promotion.actor}.
                      Policy {candidate.promotion.policyVersion}; source SHA{" "}
                      {shortHash(candidate.promotion.source.contentSha256)}.
                    </div>
                  ) : null}
                  <div className="identity-case-mini-ledger">
                    {candidate.decisions.map((decision) => (
                      <div key={decision.id}>
                        <span className="badge">{decision.action.replaceAll("_", " ")}</span>
                        <small>{formatTimestamp(decision.decidedAt)} · {decision.actor}</small>
                        {decision.note ? <p>{decision.note}</p> : null}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {identityCase.candidates.length === 0 ? (
                <div className="empty-state">No discovery Candidate has ever been linked to this Model.</div>
              ) : null}
            </div>
          </section>

          <section className="section entity-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">DRIFT & TRIAGE</p>
                <h2>Source-backed identity transitions</h2>
              </div>
            </div>
            <div className="drift-feed drift-feed-compact">
              {identityCase.drift.map((drift) => {
                const href = sourceHref(drift.currentSource);
                return (
                  <article className="drift-event" key={drift.eventId}>
                    <div className="drift-event-meta">
                      <span className="badge">{drift.changeType.replaceAll("_", " ")}</span>
                      <strong>{drift.eventId}</strong>
                      <small>{formatTimestamp(drift.occurredAt)}</small>
                      <div className="drift-fields">
                        {drift.changedFields.map((field) => (
                          <span className="badge" key={field}>{field.replaceAll("_", " ")}</span>
                        ))}
                      </div>
                    </div>
                    <div className="drift-state drift-state-before">
                      <span>Before API ID</span>
                      <strong>{drift.previousApiModelId ?? "—"}</strong>
                    </div>
                    <div className="drift-arrow" aria-hidden="true">→</div>
                    <div className="drift-state drift-state-after">
                      <span>After API ID</span>
                      <strong>{drift.currentApiModelId ?? "—"}</strong>
                    </div>
                    <div className="drift-source">
                      <span className={drift.review.status === "resolved" ? "badge badge-pass" : "badge"}>
                        review {drift.review.status}
                      </span>
                      <strong>{drift.currentSource.title ?? drift.currentSource.sourceType}</strong>
                      <small>SHA {shortHash(drift.currentSource.contentSha256)}</small>
                      {href ? <a className="text-link" href={href} target="_blank" rel="noreferrer">Source ↗</a> : null}
                    </div>
                    {drift.review.decisions.length ? (
                      <div className="identity-case-review-history">
                        {drift.review.decisions.map((decision) => (
                          <small key={decision.id}>
                            {formatTimestamp(decision.decidedAt)} · {decision.action} · {decision.actor}
                            {decision.note ? " · " + decision.note : ""}
                          </small>
                        ))}
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {identityCase.drift.length === 0 ? (
                <div className="empty-state">No source-backed identity drift is associated with this Model.</div>
              ) : null}
            </div>
          </section>

          <section className="section entity-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">EVIDENCE TIMELINE</p>
                <h2>Discovery → decision → promotion → drift → review</h2>
              </div>
              <p className="section-note">
                Raw provider response bodies are intentionally excluded; timeline sources expose provenance metadata and content hashes only.
              </p>
            </div>
            <div className="identity-timeline">
              {identityCase.timeline.map((event) => {
                const href = sourceHref(event.source);
                return (
                  <article className="identity-event" key={event.id}>
                    <div className="identity-event-time">{formatTimestamp(event.occurredAt)}</div>
                    <div className="identity-event-body">
                      <span className="badge">{event.kind.replaceAll("_", " ")}</span>
                      <strong>{event.title}</strong>
                      <small>{event.description}</small>
                      {event.actor ? <small>actor {event.actor}</small> : null}
                      {event.note ? <p>{event.note}</p> : null}
                    </div>
                    <div className="identity-event-source">
                      <span>{event.source?.sourceType ?? "decision record"}</span>
                      <strong>{event.source?.title ?? event.source?.url ?? "—"}</strong>
                      {event.source ? <small>SHA {shortHash(event.source.contentSha256)}</small> : null}
                      {href ? <a className="text-link" href={href} target="_blank" rel="noreferrer">Source ↗</a> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      ) : loaded && !error ? (
        <section className="section"><div className="empty-state">Identity Case not found.</div></section>
      ) : null}

      <footer>
        <span>Modelapse · Identity Case</span>
        <a className="text-link" href={"/models/" + modelId}>Back to public Model archive ↑</a>
      </footer>
    </main>
  );
}
