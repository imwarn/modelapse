import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  decideDriftReview,
  getDriftReviewInbox,
  type CatalogDriftReviewItem,
  type CatalogDriftReviewStatus,
} from "../modelapse";

export const Route = createFileRoute("/identity-review")({ component: IdentityReview });

function stamp(value: string): string {
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function IdentityReview() {
  const [operatorToken, setOperatorToken] = useState("");
  const [filter, setFilter] = useState<CatalogDriftReviewStatus | "all">("open");
  const [items, setItems] = useState<readonly CatalogDriftReviewItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => items.find((item) => item.eventId === selectedId) ?? null, [items, selectedId]);

  async function load(status = filter): Promise<void> {
    if (!operatorToken) return;
    setBusy(true); setError(null);
    try {
      const result = await getDriftReviewInbox({ data: { operatorToken, ...(status === "all" ? {} : { status }) } });
      setItems(result);
      if (selectedId && !result.some((item) => item.eventId === selectedId)) setSelectedId(null);
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : "Identity review request failed");
    } finally { setBusy(false); }
  }

  async function decide(action: "acknowledge" | "resolve" | "reopen"): Promise<void> {
    if (!selected) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await decideDriftReview({ data: { operatorToken, eventId: selected.eventId, action, ...(note ? { note } : {}) } });
      setMessage(`Drift ${action} recorded.`);
      setNote("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Identity review decision failed");
    } finally { setBusy(false); }
  }

  return (
    <main className="archive-page">
      <header className="archive-hero">
        <div>
          <p className="eyebrow">Archive v0.10 · operator control plane</p>
          <h1>Identity Review Queue</h1>
          <p>Review source-backed alias and execution-binding drift without mutating the immutable identity timeline.</p>
          <a className="text-link" href="/catalog-integrity">Back to Catalog Integrity →</a>
        </div>
      </header>

      <section className="control-card">
        <label>Operator token<input type="password" value={operatorToken} onChange={(e) => setOperatorToken(e.target.value)} /></label>
        <label>Status
          <select value={filter} onChange={(e) => setFilter(e.target.value as CatalogDriftReviewStatus | "all")}>
            <option value="open">Open</option><option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option><option value="all">All</option>
          </select>
        </label>
        <button type="button" disabled={busy || !operatorToken} onClick={() => void load()}>Load review queue</button>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="success-banner">{message}</p> : null}

      <section className="inbox-layout">
        <div className="inbox-list">
          {items.map((item) => (
            <button key={item.eventId} type="button" className={item.eventId === selectedId ? "inbox-row selected" : "inbox-row"} onClick={() => { setSelectedId(item.eventId); setNote(""); }}>
              <strong>{item.model?.marketingName ?? item.alias ?? item.eventId}</strong>
              <span>{item.provider.name} · {item.changeType}</span>
              <span>{stamp(item.occurredAt)} · {item.changedFields.join(", ")}</span>
            </button>
          ))}
          {!busy && items.length === 0 ? <p className="empty-state">No drift events in this review state.</p> : null}
        </div>

        {selected ? (
          <article className="inbox-detail">
            <p className="eyebrow">{selected.review.status}</p>
            <h2>{selected.model?.marketingName ?? selected.alias ?? "Identity drift"}</h2>
            <dl className="detail-grid">
              <dt>Event</dt><dd>{selected.eventId}</dd>
              <dt>Change</dt><dd>{selected.changeType}</dd>
              <dt>API identity</dt><dd>{selected.previousApiModelId ?? "—"} → {selected.currentApiModelId ?? "—"}</dd>
              <dt>Fields</dt><dd>{selected.changedFields.join(", ")}</dd>
              <dt>Previous source</dt><dd>{selected.previousSource?.title ?? selected.previousSource?.url ?? "—"}</dd>
              <dt>Current source</dt><dd>{selected.currentSource?.title ?? selected.currentSource?.url ?? "—"}</dd>
            </dl>
            {selected.currentSource?.url ? <a href={selected.currentSource.url} target="_blank" rel="noreferrer">Open current first-party evidence ↗</a> : null}
            <label>Review note<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} /></label>
            <div className="inbox-actions">
              {selected.review.status === "open" ? <button type="button" disabled={busy} onClick={() => void decide("acknowledge")}>Acknowledge</button> : null}
              {selected.review.status !== "resolved" ? <button type="button" disabled={busy} onClick={() => void decide("resolve")}>Resolve</button> : null}
              {selected.review.status !== "open" ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void decide("reopen")}>Reopen</button> : null}
            </div>
            {selected.review.latestDecision ? <p className="muted">Latest: {selected.review.latestDecision.action} by {selected.review.latestDecision.actor} · {stamp(selected.review.latestDecision.decidedAt)}</p> : null}
            {selected.model ? (
              <a className="text-link" href={"/identity-cases/" + selected.model.id}>
                Open full Identity Case →
              </a>
            ) : null}
          </article>
        ) : null}
      </section>
    </main>
  );
}
