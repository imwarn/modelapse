import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  getProviderExpansionProvider,
  getProviderExpansionProviders,
  recordProviderExpansionCapability,
  type ProviderExpansionCapabilityKey,
  type ProviderExpansionProvider,
  type ProviderExpansionProviderSummary,
} from "../modelapse";

export const Route = createFileRoute("/provider-expansion")({
  component: ProviderExpansionPage,
});

function stamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toISOString().replace("T", " ").replace(".000Z", "Z");
}

function statusClass(
  value: "ready" | "limited" | "incomplete" | "pass" | "fail",
): string {
  if (value === "ready" || value === "pass") return "badge badge-pass";
  if (value === "incomplete" || value === "fail") return "badge badge-fail";
  return "badge";
}

function ProviderExpansionPage() {
  const [operatorToken, setOperatorToken] = useState("");
  const [providers, setProviders] = useState<
    readonly ProviderExpansionProviderSummary[]
  >([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [detail, setDetail] = useState<ProviderExpansionProvider | null>(null);
  const [capability, setCapability] =
    useState<ProviderExpansionCapabilityKey>("returned_model_metadata");
  const [supportState, setSupportState] =
    useState<"supported" | "unsupported">("supported");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadProvider(providerId: string): Promise<void> {
    const provider = await getProviderExpansionProvider({
      data: { operatorToken, providerId },
    });
    setSelectedProviderId(providerId);
    setDetail(provider);
  }

  async function loadProviders(): Promise<void> {
    if (!operatorToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await getProviderExpansionProviders({
        data: { operatorToken },
      });
      setProviders(result);
      const next =
        selectedProviderId &&
        result.some((item) => item.provider.id === selectedProviderId)
          ? selectedProviderId
          : result[0]?.provider.id ?? "";
      if (next) await loadProvider(next);
      else setDetail(null);
    } catch (caught) {
      setProviders([]);
      setDetail(null);
      setError(caught instanceof Error ? caught.message : "Provider Expansion load failed");
    } finally {
      setBusy(false);
    }
  }

  async function appendCapability(): Promise<void> {
    if (!detail || !operatorToken) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await recordProviderExpansionCapability({
        data: {
          operatorToken,
          providerId: detail.provider.id,
          capability,
          supportState,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      setNote("");
      await loadProvider(detail.provider.id);
      const refreshed = await getProviderExpansionProviders({
        data: { operatorToken },
      });
      setProviders(refreshed);
      setMessage("Capability declaration appended.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Capability declaration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">M</span>
          <span>
            <strong>Modelapse</strong>
            <small>AI Model Test & Evolution Archive</small>
          </span>
        </a>
        <nav className="header-nav">
          <a className="header-link" href="/provider-testability">Testability</a>
          <a className="header-link" href="/catalog-integrity">Catalog Integrity</a>
          <span className="header-link header-link-current">Provider Expansion</span>
        </nav>
      </header>

      <section className="entity-hero">
        <div className="run-breadcrumb">
          <a href="/">Operator</a>
          <span>/</span>
          <span>Provider Expansion</span>
        </div>
        <div className="run-title-row">
          <div>
            <p className="eyebrow">ARCHIVE v0.24 · PROVIDER EXPANSION PLAYBOOK</p>
            <h1>HTTP success is not onboarding completion.</h1>
            <p className="run-subtitle">
              Readiness is derived from identity provenance, catalog collection,
              access and pricing evidence, runner context, verified execution,
              calibration, and explicit adapter capability declarations.
              No percentage readiness score is computed.
            </p>
          </div>
        </div>
      </section>

      <section className="section control-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OPERATOR ACCESS</p>
            <h2>Load provider onboarding state</h2>
          </div>
          <span className="badge">control-plane only</span>
        </div>
        <div className="control-grid">
          <label>
            <span>Operator token</span>
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
              disabled={busy || !operatorToken}
              onClick={() => void loadProviders()}
            >
              {busy ? "Loading…" : "Load playbook"}
            </button>
            <small>
              Credentials for Providers remain in controlled workers and are never
              returned by this view.
            </small>
          </div>
        </div>
        {error ? <div className="notice notice-error">{error}</div> : null}
        {message ? <div className="notice">{message}</div> : null}
      </section>

      {providers.length ? (
        <section className="section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PROVIDER MATRIX</p>
              <h2>Expansion state</h2>
            </div>
            <span className="badge">categorical · no score</span>
          </div>
          <div className="testability-provider-grid">
            {providers.map((item) => (
              <button
                type="button"
                key={item.provider.id}
                className={
                  selectedProviderId === item.provider.id
                    ? "testability-provider-card selected"
                    : "testability-provider-card"
                }
                onClick={() => void loadProvider(item.provider.id)}
                disabled={busy}
              >
                <strong>{item.provider.name}</strong>
                <small>
                  {item.provider.slug} · {item.activeModelCount} active/preview models
                </small>
                <div className="testability-card-facts">
                  <span className={statusClass(item.status)}>{item.status}</span>
                  <span>{item.blockerCount} blockers</span>
                  <span>{item.caveatCount} caveats</span>
                  <span>{item.policyVersion}</span>
                </div>
                <small>direct {stamp(item.latestDirectRunAt)}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {detail ? (
        <>
          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">PLAYBOOK RESULT</p>
                <h2>{detail.provider.name}</h2>
              </div>
              <span className={statusClass(detail.status)}>{detail.status}</span>
            </div>

            <div className="notice">
              <strong>{detail.policy.version}</strong>
              <span>
                projected {stamp(detail.generatedAt)} · latest direct{" "}
                {stamp(detail.latestDirectRunAt)} · latest calibration{" "}
                {stamp(detail.latestCalibrationAt)}
              </span>
            </div>

            {detail.blockers.length ? (
              <div className="notice notice-error">
                <strong>Onboarding blockers</strong>
                <span>{detail.blockers.join(" · ")}</span>
              </div>
            ) : null}
            {detail.caveats.length ? (
              <div className="notice">
                <strong>Known limitations</strong>
                <span>{detail.caveats.join(" · ")}</span>
              </div>
            ) : null}

            <div className="integrity-list">
              {detail.gates.map((item) => (
                <article className="integrity-row" key={item.key}>
                  <div className="integrity-title-line">
                    <strong>{item.key.replaceAll("_", " ")}</strong>
                    <span className={statusClass(item.status)}>{item.status}</span>
                  </div>
                  <p>{item.summary}</p>
                  {item.blockers.length ? (
                    <p>Blockers: {item.blockers.join(" · ")}</p>
                  ) : null}
                  {item.caveats.length ? (
                    <p>Caveats: {item.caveats.join(" · ")}</p>
                  ) : null}
                  <small>{item.evidenceIds.length} evidence reference(s)</small>
                </article>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">ADAPTER CONTRACT</p>
                <h2>Supported and unsupported capture</h2>
              </div>
              <span className="badge">append-only declarations</span>
            </div>
            <div className="integrity-list">
              {detail.capabilities.map((item) => (
                <article className="integrity-row" key={item.capability}>
                  <div className="integrity-title-line">
                    <strong>{item.capability.replaceAll("_", " ")}</strong>
                    <div className="run-verdict">
                      <span
                        className={
                          item.supportState === "supported"
                            ? "badge badge-pass"
                            : item.supportState === "unsupported"
                              ? "badge"
                              : "badge badge-fail"
                        }
                      >
                        {item.supportState ?? "undeclared"}
                      </span>
                      <span className={item.observed ? "badge badge-pass" : "badge"}>
                        {item.observed ? "observed" : "not observed"}
                      </span>
                    </div>
                  </div>
                  <p>
                    event {item.eventId?.slice(0, 8) ?? "—"} · source{" "}
                    {item.sourceId?.slice(0, 8) ?? "—"} · declared{" "}
                    {stamp(item.declaredAt)}
                  </p>
                  {item.note ? <p>{item.note}</p> : null}
                </article>
              ))}
            </div>
          </section>

          <section className="section control-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">APPEND CAPABILITY</p>
                <h2>Declare a Provider capability</h2>
              </div>
              <span className="badge">never overwrite history</span>
            </div>
            <div className="control-grid">
              <label>
                <span>Capability</span>
                <select
                  value={capability}
                  onChange={(event) =>
                    setCapability(event.target.value as ProviderExpansionCapabilityKey)
                  }
                  disabled={busy}
                >
                  {detail.capabilities.map((item) => (
                    <option value={item.capability} key={item.capability}>
                      {item.capability.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Support state</span>
                <select
                  value={supportState}
                  onChange={(event) =>
                    setSupportState(event.target.value as "supported" | "unsupported")
                  }
                  disabled={busy}
                >
                  <option value="supported">supported</option>
                  <option value="unsupported">unsupported</option>
                </select>
              </label>
              <label>
                <span>Note</span>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Reason / source context"
                  disabled={busy}
                />
              </label>
              <div className="run-action">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void appendCapability()}
                >
                  Append declaration
                </button>
                <small>
                  A later declaration changes only the current projection. Earlier
                  declarations remain auditable.
                </small>
              </div>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CONTROLLED ENVIRONMENTS</p>
                <h2>Fleet context</h2>
              </div>
            </div>
            <div className="integrity-list">
              {detail.fleet.map((environment) => (
                <article className="integrity-row" key={environment.environmentId}>
                  <strong>{environment.slug}</strong>
                  <p>
                    {environment.region} · account {environment.accountTier ?? "unknown"}
                    {" · "}service {environment.serviceTier ?? "default/unspecified"}
                    {" · "}{environment.serviceAssurance.replaceAll("_", " ")}
                  </p>
                </article>
              ))}
              {!detail.fleet.length ? (
                <div className="empty-state">No enabled fleet capability for this Provider.</div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      <footer>
        <span>Modelapse · Provider Expansion Playbook</span>
        <a className="text-link" href="/">Back to Operator ↑</a>
      </footer>
    </main>
  );
}
