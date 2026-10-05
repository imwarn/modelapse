import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  decideCatalogPresenceReview,
  getCatalogPresenceReviewInbox,
  type CatalogPresenceReviewItem,
  type CatalogPresenceReviewStatus,
} from "../modelapse";

export const Route = createFileRoute("/catalog-presence-review")({
  component: CatalogPresenceReview,
});

function stamp(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function CatalogPresenceReview() {
  const [operatorToken, setOperatorToken] = useState("");
  const [filter, setFilter] = useState<CatalogPresenceReviewStatus | "all">("open");
  const [items, setItems] = useState<readonly CatalogPresenceReviewItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((item) => item.eventId === selectedId) ?? null,
    [items, selectedId],
  );

  async function load(status = filter): Promise<void> {
    if (!operatorToken) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getCatalogPresenceReviewInbox({
        data: {
          operatorToken,
          ...(status === "all" ? {} : { status }),
        },
      });
      setItems(result);
      if (selectedId && !result.some((item) => item.eventId === selectedId)) {
        setSelectedId(null);
      }
    } catch (cause) {
      setItems([]);
      setError(
        cause instanceof Error ? cause.message : "Catalog presence review request failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "acknowledge" | "resolve" | "reopen"): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await decideCatalogPresenceReview({
        data: {
          operatorToken,
          providerId: selected.provider.id,
          eventId: selected.eventId,
          action,
          ...(note ? { note } : {}),
        },
      });
      setMessage(`Presence review ${action} recorded. This does not change model lifecycle state.`);
      setNote("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Catalog presence review decision failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="archive-page">
      <header className="archive-hero">
        <div>
          <p className="eyebrow">Archive v0.16 · operator control plane</p>
          <h1>Catalog Presence Review</h1>
          <p>
            Triage evidence that a remote model ID was not observed in a later complete
            first-party model-list snapshot. Review state is operational only: it never means
            retired, deprecated, deleted, or unavailable.
          </p>
          <div className="presence-review-nav">
            <a className="text-link" href="/catalog-integrity">Catalog Integrity →</a>
            <a className="text-link" href="/catalog-coverage">Provider Coverage →</a>
          </div>
        </div>
      </header>

      <section className="control-card">
        <label>
          Operator token
          <input
            type="password"
            value={operatorToken}
            onChange={(event) => setOperatorToken(event.target.value)}
          />
        </label>
        <label>
          Status
          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as CatalogPresenceReviewStatus | "all")
            }
          >
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !operatorToken}
          onClick={() => void load()}
        >
          Load presence review queue
        </button>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="success-banner">{message}</p> : null}

      <section className="inbox-layout">
        <div className="inbox-list">
          {items.map((item) => (
            <button
              key={item.eventId}
              type="button"
              className={item.eventId === selectedId ? "inbox-row selected" : "inbox-row"}
              onClick={() => {
                setSelectedId(item.eventId);
                setNote("");
              }}
            >
              <strong>{item.remoteModelId}</strong>
              <span>{item.provider.name} · {item.observerSource.title}</span>
              <span>{stamp(item.occurredAt)} · {item.review.status}</span>
            </button>
          ))}
          {!busy && items.length === 0 ? (
            <p className="empty-state">No presence events in this review state.</p>
          ) : null}
        </div>

        {selected ? (
          <article className="inbox-detail">
            <p className="eyebrow">{selected.review.status}</p>
            <h2>{selected.remoteModelId}</h2>
            <p className="muted">
              Evidence interpretation: {selected.interpretation.replaceAll("_", " ")}.
              This is not a lifecycle verdict.
            </p>
            <dl className="detail-grid">
              <dt>Provider</dt><dd>{selected.provider.name}</dd>
              <dt>Observer source</dt><dd>{selected.observerSource.title}</dd>
              <dt>Occurred</dt><dd>{stamp(selected.occurredAt)}</dd>
              <dt>Run</dt><dd>{selected.runId}</dd>
              <dt>Previous complete run</dt><dd>{selected.previousCompleteRunId ?? "—"}</dd>
              <dt>Canonical model</dt>
              <dd>{selected.currentContext.canonicalModel?.marketingName ?? "—"}</dd>
              <dt>Candidate</dt>
              <dd>{selected.currentContext.candidate?.status ?? "—"}</dd>
              <dt>Acknowledged</dt><dd>{stamp(selected.review.acknowledgedAt)}</dd>
              <dt>Resolved</dt><dd>{stamp(selected.review.resolvedAt)}</dd>
            </dl>

            <a
              href={selected.observerSource.url}
              target="_blank"
              rel="noreferrer"
            >
              Open first-party model-list source ↗
            </a>

            <label>
              Review note
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                placeholder="Record what was checked. Do not infer retirement from absence alone."
              />
            </label>

            <div className="inbox-actions">
              {selected.review.status === "open" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("acknowledge")}
                >
                  Acknowledge
                </button>
              ) : null}
              {selected.review.status !== "resolved" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide("resolve")}
                >
                  Resolve review
                </button>
              ) : null}
              {selected.review.status !== "open" ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => void decide("reopen")}
                >
                  Reopen
                </button>
              ) : null}
            </div>

            {selected.review.latestDecision ? (
              <p className="muted">
                Latest: {selected.review.latestDecision.action} by{" "}
                {selected.review.latestDecision.actor} ·{" "}
                {stamp(selected.review.latestDecision.decidedAt)}
                {selected.review.latestDecision.note
                  ? ` · ${selected.review.latestDecision.note}`
                  : ""}
              </p>
            ) : null}

            <div className="presence-review-nav">
              <a
                className="text-link"
                href={
                  "/catalog-remote-case/" +
                  selected.provider.id +
                  "?remoteModelId=" +
                  encodeURIComponent(selected.remoteModelId)
                }
              >
                Open Remote ID Case →
              </a>
              <a
                className="text-link"
                href={"/catalog-presence/" + selected.provider.id}
              >
                Open provider presence timeline →
              </a>
              {selected.currentContext.canonicalModel ? (
                <a
                  className="text-link"
                  href={"/identity-cases/" + selected.currentContext.canonicalModel.id}
                >
                  Open Identity Case →
                </a>
              ) : null}
              {selected.currentContext.candidate ? (
                <a className="text-link" href="/catalog-inbox">
                  Open Catalog Inbox →
                </a>
              ) : null}
            </div>
          </article>
        ) : null}
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BOUNDARY</p>
            <h2>Resolve the review, not the model lifecycle</h2>
          </div>
        </div>
        <p className="section-intro">
          Acknowledge / resolve / reopen only records operator handling of the presence-gap
          evidence. These actions never mutate canonical Models, execution bindings, aliases,
          Candidate state, or provider lifecycle semantics.
        </p>
      </section>
    </main>
  );
}
