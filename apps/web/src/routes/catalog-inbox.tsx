import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  getCatalogInbox,
  getCatalogProviderModels,
  promoteCatalogCandidate,
  reconcileCatalogCandidate,
  type CatalogDiscoveryCandidate,
  type CatalogDiscoveryStatus,
} from "../modelapse";

export const Route = createFileRoute("/catalog-inbox")({
  component: CatalogInbox,
});

function suggestedSlug(remoteModelId: string): string {
  return remoteModelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function suggestedName(remoteModelId: string): string {
  return remoteModelId
    .split(/[-_.:/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string): string {
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function CatalogInbox() {
  const [operatorToken, setOperatorToken] = useState("");
  const [candidates, setCandidates] = useState<readonly CatalogDiscoveryCandidate[]>([]);
  const [filter, setFilter] = useState<CatalogDiscoveryStatus | "all">("discovered");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canonicalSlug, setCanonicalSlug] = useState("");
  const [marketingName, setMarketingName] = useState("");
  const [modelStatus, setModelStatus] = useState<"preview" | "active">("active");
  const [providerModels, setProviderModels] = useState<
    readonly { id: string; canonicalSlug: string; marketingName: string; status: string }[]
  >([]);
  const [resolvedModelId, setResolvedModelId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? null,
    [candidates, selectedId],
  );

  async function loadInbox(status = filter): Promise<void> {
    if (!operatorToken) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getCatalogInbox({
        data: {
          operatorToken,
          ...(status === "all" ? {} : { status }),
        },
      });
      setCandidates(result);
      if (selectedId && !result.some((candidate) => candidate.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (cause) {
      setCandidates([]);
      setError(cause instanceof Error ? cause.message : "Catalog Inbox request failed");
    } finally {
      setBusy(false);
    }
  }

  async function selectCandidate(candidate: CatalogDiscoveryCandidate): Promise<void> {
    setSelectedId(candidate.id);
    setCanonicalSlug(suggestedSlug(candidate.remoteModelId));
    setMarketingName(suggestedName(candidate.remoteModelId));
    setModelStatus("active");
    setNote("");
    setMessage(null);
    setError(null);
    setResolvedModelId("");
    try {
      const models = await getCatalogProviderModels({
        data: { operatorToken, providerId: candidate.provider.id },
      });
      setProviderModels(models);
    } catch {
      setProviderModels([]);
    }
  }

  async function reconcile(
    action: "match_existing" | "ignore" | "mark_promotion_ready" | "reopen",
  ): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await reconcileCatalogCandidate({
        data: {
          operatorToken,
          candidateId: selected.id,
          action,
          ...(action === "match_existing" && resolvedModelId
            ? { resolvedModelId }
            : {}),
          ...(note ? { note } : {}),
        },
      });
      setMessage(
        action === "mark_promotion_ready"
          ? "Candidate marked promotion ready. Review canonical identity fields before promotion."
          : action === "ignore"
            ? "Candidate ignored; observation history remains intact."
            : "Candidate reopened for review.",
      );
      await loadInbox();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reconciliation failed");
    } finally {
      setBusy(false);
    }
  }

  async function promote(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await promoteCatalogCandidate({
        data: {
          operatorToken,
          candidateId: selected.id,
          canonicalSlug,
          marketingName,
          status: modelStatus,
          ...(note ? { note } : {}),
        },
      });
      setMessage(`Promoted to canonical Model ${result.modelId}. The promotion and reconciliation events are immutable.`);
      await loadInbox();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Promotion failed");
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
            <small>Catalog Discovery Inbox</small>
          </span>
        </a>
        <a className="header-link" href="/changes">Public catalog changes →</a>
      </header>

      <section className="hero inbox-hero">
        <div>
          <p className="eyebrow">OPERATOR / ARCHIVE v0.9</p>
          <h1>
            Discovery is evidence.
            <br />
            Promotion is a decision.
          </h1>
          <p className="hero-copy">
            Review remote model IDs observed from first-party catalog sources.
            Reconcile or promote them without rewriting the immutable collection
            history that discovered them.
          </p>
        </div>
      </section>

      <section className="section control-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACCESS</p>
            <h2>Unlock Catalog Inbox</h2>
          </div>
          <span className={candidates.length ? "badge badge-pass" : "badge"}>
            {candidates.length ? `${candidates.length} loaded` : "operator locked"}
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
            <small>The API control credential remains server-side.</small>
          </label>
          <label>
            <span>Candidate state</span>
            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as CatalogDiscoveryStatus | "all")
              }
              disabled={busy}
            >
              <option value="discovered">Discovered</option>
              <option value="promotion_ready">Promotion ready</option>
              <option value="ignored">Ignored</option>
              <option value="matched">Matched / promoted</option>
              <option value="all">All states</option>
            </select>
            <small>Filtering changes the operator projection, not history.</small>
          </label>
          <div className="run-action">
            <button
              type="button"
              disabled={busy || !operatorToken}
              onClick={() => void loadInbox()}
            >
              {busy ? "Loading…" : "Load Catalog Inbox"}
            </button>
          </div>
        </div>
        {error ? <div className="notice notice-error">{error}</div> : null}
        {message ? <div className="notice">{message}</div> : null}
      </section>

      <section className="section inbox-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DISCOVERY QUEUE</p>
            <h2>First-party remote IDs</h2>
          </div>
        </div>

        <div className="inbox-layout">
          <div className="inbox-list">
            {candidates.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                className={
                  selectedId === candidate.id
                    ? "inbox-candidate inbox-candidate-selected"
                    : "inbox-candidate"
                }
                onClick={() => void selectCandidate(candidate)}
              >
                <span>
                  <strong>{candidate.remoteModelId}</strong>
                  <small>{candidate.provider.name} · {candidate.status}</small>
                </span>
                <span>
                  <b>{candidate.observationCount}×</b>
                  <small>last {formatTimestamp(candidate.lastSeenAt)}</small>
                </span>
              </button>
            ))}
            {candidates.length === 0 ? (
              <div className="empty-state">
                Unlock the Inbox, or no candidates match this state.
              </div>
            ) : null}
          </div>

          <aside className="inbox-review">
            {selected ? (
              <>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">REVIEW</p>
                    <h2>{selected.remoteModelId}</h2>
                  </div>
                  <span className="badge">{selected.status}</span>
                </div>

                <dl className="inbox-evidence">
                  <div><dt>provider</dt><dd>{selected.provider.name}</dd></div>
                  <div><dt>observations</dt><dd>{selected.observationCount}</dd></div>
                  <div><dt>first seen</dt><dd>{formatTimestamp(selected.firstSeenAt)}</dd></div>
                  <div><dt>last seen</dt><dd>{formatTimestamp(selected.lastSeenAt)}</dd></div>
                  <div><dt>source type</dt><dd>{selected.lastSource.sourceType}</dd></div>
                  <div><dt>source SHA</dt><dd>{selected.lastSource.contentSha256?.slice(0, 16) ?? "—"}</dd></div>
                </dl>

                {selected.lastSource.url ? (
                  <a
                    className="text-link"
                    href={selected.lastSource.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open first-party source →
                  </a>
                ) : null}

                <label>
                  <span>Review note</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    disabled={busy}
                    placeholder="Why is this classification justified?"
                  />
                </label>

                <div className="inbox-actions">
                  {selected.status === "discovered" ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void reconcile("mark_promotion_ready")}
                      >
                        Mark promotion ready
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void reconcile("ignore")}
                      >
                        Ignore candidate
                      </button>
                      {providerModels.length ? (
                        <div className="match-existing-panel">
                          <select
                            aria-label="Existing canonical Model"
                            value={resolvedModelId}
                            onChange={(event) => setResolvedModelId(event.target.value)}
                            disabled={busy}
                          >
                            <option value="">Match an existing Model…</option>
                            {providerModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.marketingName} · {model.canonicalSlug}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy || !resolvedModelId}
                            onClick={() => void reconcile("match_existing")}
                          >
                            Match existing
                          </button>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {selected.status === "ignored" || selected.status === "matched" ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void reconcile("reopen")}
                    >
                      Reopen review
                    </button>
                  ) : null}
                </div>

                {selected.status === "promotion_ready" ? (
                  <div className="promotion-panel">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">EXPLICIT PROMOTION</p>
                        <p>
                          Promotion creates a canonical Model and first-party execution
                          binding from this candidate's existing provider catalog evidence.
                        </p>
                      </div>
                      <span className={selected.promotionPolicy.eligible ? "badge badge-pass" : "badge"}>
                        {selected.promotionPolicy.eligible ? "policy eligible" : "policy blocked"}
                      </span>
                    </div>
                    <dl className="inbox-evidence">
                      <div><dt>policy</dt><dd>{selected.promotionPolicy.version}</dd></div>
                      <div><dt>evidence SHA</dt><dd>{selected.promotionPolicy.evidence.contentSha256?.slice(0, 16) ?? "—"}</dd></div>
                    </dl>
                    {!selected.promotionPolicy.eligible ? (
                      <div className="notice notice-error">
                        Promotion blocked: {selected.promotionPolicy.blockers.join(", ")}
                      </div>
                    ) : null}
                    <label>
                      <span>Canonical slug</span>
                      <input
                        value={canonicalSlug}
                        onChange={(event) => setCanonicalSlug(event.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      <span>Marketing name</span>
                      <input
                        value={marketingName}
                        onChange={(event) => setMarketingName(event.target.value)}
                        disabled={busy}
                      />
                    </label>
                    <label>
                      <span>Initial status</span>
                      <select
                        value={modelStatus}
                        onChange={(event) =>
                          setModelStatus(event.target.value as "preview" | "active")
                        }
                        disabled={busy}
                      >
                        <option value="active">Active</option>
                        <option value="preview">Preview</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        !canonicalSlug ||
                        !marketingName ||
                        !selected.promotionPolicy.eligible
                      }
                      onClick={() => void promote()}
                    >
                      Promote canonical Model
                    </button>
                    <small>
                      This is intentionally separate from discovery. The server re-checks
                      this policy under the same database transaction as Model registration
                      and immutable promotion audit.
                    </small>
                  </div>
                ) : null}

                {selected.promotion ? (
                  <div className="notice">
                    Promoted {formatTimestamp(selected.promotion.promotedAt)} by{" "}
                    {selected.promotion.actor}. Model {selected.promotion.modelId}. Policy{" "}
                    {selected.promotion.policyVersion}.{" "}
                    <a className="text-link" href={"/identity-cases/" + selected.promotion.modelId}>
                      Open Identity Case →
                    </a>
                  </div>
                ) : selected.resolvedModel ? (
                  <div className="notice">
                    Linked to canonical Model {selected.resolvedModel.marketingName}.{" "}
                    <a className="text-link" href={"/identity-cases/" + selected.resolvedModel.id}>
                      Open Identity Case →
                    </a>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="empty-state">
                Select a candidate to inspect provenance and reconciliation actions.
              </div>
            )}
          </aside>
        </div>
      </section>

      <footer>
        <span>Modelapse</span>
        <span>observe → review → promote</span>
      </footer>
    </main>
  );
}
