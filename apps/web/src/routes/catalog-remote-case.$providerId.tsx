import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getCatalogRemoteIdCase,
  type CatalogRemoteIdCase,
  type CatalogRemoteIdCaseTimelineKind,
} from "../modelapse";

export const Route = createFileRoute("/catalog-remote-case/$providerId")({
  validateSearch: (search: Record<string, unknown>) => ({
    remoteModelId:
      typeof search.remoteModelId === "string" ? search.remoteModelId : "",
  }),
  component: CatalogRemoteIdCasePage,
});

const KIND_LABELS: Readonly<Record<CatalogRemoteIdCaseTimelineKind, string>> = {
  discovery_observation: "Discovery observation",
  canonical_observation: "Canonical observation",
  presence_appeared: "Presence appeared",
  presence_not_observed: "Presence not observed",
  presence_reobserved: "Presence reobserved",
  reconciliation: "Candidate decision",
  promotion: "Promotion",
  presence_review: "Presence review",
};

function stamp(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 12) : "—";
}

function CatalogRemoteIdCasePage() {
  const { providerId } = Route.useParams();
  const { remoteModelId } = Route.useSearch();
  const [operatorToken, setOperatorToken] = useState("");
  const [remoteCase, setRemoteCase] = useState<CatalogRemoteIdCase | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (!operatorToken || !remoteModelId) return;
    setBusy(true);
    setError(null);
    try {
      setRemoteCase(
        await getCatalogRemoteIdCase({
          data: { operatorToken, providerId, remoteModelId },
        }),
      );
    } catch (cause) {
      setRemoteCase(null);
      setError(
        cause instanceof Error ? cause.message : "Remote ID Case request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/catalog-coverage" aria-label="Provider coverage">
          <span className="brand-mark">M</span>
          <span>
            <strong>Modelapse</strong>
            <small>Remote ID Evidence Case</small>
          </span>
        </a>
        <nav className="integrity-nav">
          <a href={"/catalog-coverage/" + providerId}>Coverage detail</a>
          <a href={"/catalog-presence/" + providerId}>Presence timeline</a>
          <a href="/catalog-presence-review">Presence review</a>
          <a href="/catalog-integrity">Integrity</a>
        </nav>
      </header>

      <section className="hero integrity-hero remote-case-hero">
        <div>
          <p className="eyebrow">OPERATOR / ARCHIVE v0.17</p>
          <h1>{remoteModelId || "Remote ID Evidence Case"}</h1>
          <p className="hero-copy">
            One evidence timeline for a provider remote ID: catalog observations,
            presence transitions, Candidate decisions, promotion, and presence-review audit.
            The case is read-only and does not create lifecycle meaning.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <strong>{remoteCase?.summary.observationEvents ?? "—"}</strong>
            <span>observations</span>
          </div>
          <div>
            <strong>{remoteCase?.summary.presenceTransitions ?? "—"}</strong>
            <span>presence transitions</span>
          </div>
          <div>
            <strong>{remoteCase?.timeline.length ?? "—"}</strong>
            <span>timeline facts</span>
          </div>
        </div>
      </section>

      <section className="section control-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACCESS</p>
            <h2>Load Remote ID Case</h2>
          </div>
          <span className={remoteCase ? "badge badge-pass" : "badge"}>
            {remoteCase ? "evidence case loaded" : "operator locked"}
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
            <button
              type="button"
              disabled={busy || !operatorToken || !remoteModelId}
              onClick={() => void load()}
            >
              {busy ? "Loading case…" : "Load evidence case"}
            </button>
          </div>
        </div>
        {!remoteModelId ? (
          <p className="error-banner">remoteModelId query parameter is required.</p>
        ) : null}
        {error ? <p className="error-banner">{error}</p> : null}
      </section>

      {remoteCase ? (
        <>
          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CURRENT CONTEXT</p>
                <h2>{remoteCase.provider.name} · {remoteCase.remoteModelId}</h2>
              </div>
              <span className="badge">projected {stamp(remoteCase.generatedAt)}</span>
            </div>
            <div className="remote-case-context-grid">
              <article className="integrity-row">
                <div className="integrity-title-line">
                  <strong>Candidate</strong>
                  <span className="badge">
                    {remoteCase.current.candidate?.status ?? "none"}
                  </span>
                </div>
                <dl className="integrity-facts">
                  <dt>First seen</dt>
                  <dd>{stamp(remoteCase.current.candidate?.firstSeenAt ?? null)}</dd>
                  <dt>Last seen</dt>
                  <dd>{stamp(remoteCase.current.candidate?.lastSeenAt ?? null)}</dd>
                  <dt>Observations</dt>
                  <dd>{remoteCase.current.candidate?.observationCount ?? 0}</dd>
                </dl>
                {remoteCase.current.candidate ? (
                  <a className="text-link" href="/catalog-inbox">
                    Open Catalog Inbox →
                  </a>
                ) : null}
              </article>

              <article className="integrity-row">
                <div className="integrity-title-line">
                  <strong>Canonical Model</strong>
                  <span className={remoteCase.current.canonicalModel ? "badge badge-pass" : "badge"}>
                    {remoteCase.current.canonicalModel?.status ?? "unresolved"}
                  </span>
                </div>
                <p>
                  {remoteCase.current.canonicalModel
                    ? remoteCase.current.canonicalModel.marketingName +
                      " · " +
                      remoteCase.current.canonicalModel.canonicalSlug
                    : "No current canonical Model resolution."}
                </p>
                {remoteCase.current.canonicalModel ? (
                  <a
                    className="text-link"
                    href={"/identity-cases/" + remoteCase.current.canonicalModel.id}
                  >
                    Open Identity Case →
                  </a>
                ) : null}
              </article>

              <article className="integrity-row">
                <div className="integrity-title-line">
                  <strong>Promotion</strong>
                  <span className={remoteCase.current.promotion ? "badge badge-pass" : "badge"}>
                    {remoteCase.current.promotion ? "recorded" : "none"}
                  </span>
                </div>
                {remoteCase.current.promotion ? (
                  <dl className="integrity-facts">
                    <dt>Promoted</dt>
                    <dd>{stamp(remoteCase.current.promotion.promotedAt)}</dd>
                    <dt>Actor</dt>
                    <dd>{remoteCase.current.promotion.actor}</dd>
                    <dt>Policy</dt>
                    <dd>{remoteCase.current.promotion.policyVersion}</dd>
                    <dt>Evidence SHA</dt>
                    <dd>{shortSha(remoteCase.current.promotion.source.contentSha256)}</dd>
                  </dl>
                ) : (
                  <p>No promotion event is associated with this remote ID.</p>
                )}
              </article>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CASE SUMMARY</p>
                <h2>Evidence counts, not scores</h2>
              </div>
            </div>
            <div className="integrity-summary-grid remote-case-summary-grid">
              <article className="integrity-count">
                <strong>{remoteCase.summary.observationEvents}</strong>
                <span>observation events</span>
              </article>
              <article className="integrity-count">
                <strong>{remoteCase.summary.presenceTransitions}</strong>
                <span>presence transitions</span>
              </article>
              <article className="integrity-count">
                <strong>{remoteCase.summary.reconciliationEvents}</strong>
                <span>Candidate decisions</span>
              </article>
              <article className="integrity-count">
                <strong>{remoteCase.summary.reviewDecisions}</strong>
                <span>review decisions</span>
              </article>
              <article className="integrity-count">
                <strong>{remoteCase.summary.openPresenceReviews}</strong>
                <span>open reviews</span>
              </article>
              <article className="integrity-count">
                <strong>{remoteCase.summary.acknowledgedPresenceReviews}</strong>
                <span>acknowledged reviews</span>
              </article>
              <article className="integrity-count">
                <strong>{remoteCase.summary.resolvedPresenceReviews}</strong>
                <span>resolved reviews</span>
              </article>
              <article className="integrity-count">
                <strong>{stamp(remoteCase.summary.lastObservedAt)}</strong>
                <span>last observed</span>
              </article>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PRESENCE REVIEWS</p>
                <h2>Operational handling, not lifecycle state</h2>
              </div>
              <a className="text-link" href="/catalog-presence-review">
                Open review queue →
              </a>
            </div>
            <div className="integrity-list">
              {remoteCase.presenceReviews.map((review) => (
                <article className="integrity-row" key={review.eventId}>
                  <div className="integrity-title-line">
                    <strong>{review.eventId}</strong>
                    <span className="badge">{review.status}</span>
                  </div>
                  <dl className="integrity-facts">
                    <dt>Presence event</dt><dd>{stamp(review.occurredAt)}</dd>
                    <dt>Acknowledged</dt><dd>{stamp(review.acknowledgedAt)}</dd>
                    <dt>Resolved</dt><dd>{stamp(review.resolvedAt)}</dd>
                    <dt>Decisions</dt><dd>{review.decisions.length}</dd>
                  </dl>
                  <p>
                    Review completion means the evidence was handled. It does not imply
                    provider retirement, deprecation, or execution invalidity.
                  </p>
                </article>
              ))}
              {remoteCase.presenceReviews.length === 0 ? (
                <p className="empty-state">No durable presence-review record for this remote ID.</p>
              ) : null}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">EVIDENCE TIMELINE</p>
                <h2>Remote ID history across workflows</h2>
              </div>
              <span className="badge">{remoteCase.timeline.length} facts</span>
            </div>
            <div className="timeline remote-case-timeline">
              {remoteCase.timeline.map((event) => (
                <article className="timeline-event remote-case-event" key={event.id}>
                  <div className="timeline-marker" />
                  <div className="timeline-time">{stamp(event.occurredAt)}</div>
                  <div className="timeline-body">
                    <div className="integrity-title-line">
                      <strong>{event.title}</strong>
                      <span
                        className={
                          event.kind === "presence_not_observed"
                            ? "badge badge-fail"
                            : event.kind === "promotion" ||
                                event.kind === "canonical_observation" ||
                                event.kind === "presence_reobserved"
                              ? "badge badge-pass"
                              : "badge"
                        }
                      >
                        {KIND_LABELS[event.kind]}
                      </span>
                    </div>
                    <p>{event.description}</p>
                    {event.actor ? <small>Actor: {event.actor}</small> : null}
                    {event.note ? <small>Note: {event.note}</small> : null}
                    {event.source ? (
                      <dl className="integrity-facts remote-case-source">
                        <dt>Source</dt>
                        <dd>{event.source.title ?? event.source.url ?? event.source.sourceType}</dd>
                        <dt>Retrieved</dt>
                        <dd>{stamp(event.source.retrievedAt)}</dd>
                        <dt>SHA-256</dt>
                        <dd>{shortSha(event.source.contentSha256)}</dd>
                      </dl>
                    ) : null}
                    {event.source?.url ? (
                      <a
                        className="text-link"
                        href={event.source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open first-party evidence ↗
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
              {remoteCase.timeline.length === 0 ? (
                <p className="empty-state">No evidence facts are available for this remote ID.</p>
              ) : null}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">BOUNDARY</p>
                <h2>One case, no new authority</h2>
              </div>
            </div>
            <p className="section-intro">
              Remote ID Case is a projection over existing immutable and append-only facts.
              It does not promote Candidates, resolve identity, alter execution bindings,
              infer retirement from provider-list absence, or create a second catalog truth.
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
