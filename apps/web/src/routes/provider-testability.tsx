import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  getProviderTestabilityProvider,
  getProviderTestabilityProviders,
  recordProviderTestabilityObservation,
  type ProviderTestabilityAccessState,
  type ProviderTestabilityProvider,
  type ProviderTestabilityProviderSummary,
  type ProviderTestabilityServiceAssurance,
  type ProviderTestabilitySubjectKind,
} from "../modelapse";

export const Route = createFileRoute("/provider-testability")({
  component: ProviderTestabilityPage,
});

function stamp(value: string | null): string {
  if (!value) return "—";
  return value.replace("T", " ").slice(0, 19) + "Z";
}

function tags(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function assuranceClass(value: ProviderTestabilityServiceAssurance): string {
  if (value === "operator_uncertain") return "badge badge-fail";
  if (value === "documented_default") return "badge badge-pass";
  return "badge";
}

function accessClass(value: ProviderTestabilityAccessState): string {
  if (value === "available") return "badge badge-pass";
  if (value === "restricted" || value === "unavailable") return "badge badge-fail";
  return "badge";
}

function ProviderTestabilityPage() {
  const [operatorToken, setOperatorToken] = useState("");
  const [providers, setProviders] = useState<readonly ProviderTestabilityProviderSummary[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [detail, setDetail] = useState<ProviderTestabilityProvider | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [modelId, setModelId] = useState("");
  const [subjectKind, setSubjectKind] =
    useState<ProviderTestabilitySubjectKind>("provider_policy");
  const [accessState, setAccessState] =
    useState<ProviderTestabilityAccessState>("unknown");
  const [registrationRequirement, setRegistrationRequirement] = useState("unknown");
  const [billingRequirement, setBillingRequirement] = useState("unknown");
  const [regionPolicy, setRegionPolicy] = useState("unknown");
  const [allowedRegions, setAllowedRegions] = useState("");
  const [blockedRegions, setBlockedRegions] = useState("");
  const [accountTier, setAccountTier] = useState("");
  const [serviceTier, setServiceTier] = useState("");
  const [serviceAssurance, setServiceAssurance] =
    useState<ProviderTestabilityServiceAssurance>("unknown");
  const [currency, setCurrency] = useState("");
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [requestPrice, setRequestPrice] = useState("");
  const [sourceType, setSourceType] = useState<
    "provider_docs" | "provider_pricing" | "provider_policy" | "operator_verification"
  >("provider_policy");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceSha, setSourceSha] = useState("");
  const [note, setNote] = useState("");

  const selectedSummary = useMemo(
    () => providers.find((item) => item.provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId],
  );

  async function loadProviders(): Promise<void> {
    if (!operatorToken) return;
    setBusy(true);
    setError(null);
    try {
      const result = await getProviderTestabilityProviders({
        data: { operatorToken },
      });
      setProviders(result);
      const nextId =
        selectedProviderId && result.some((item) => item.provider.id === selectedProviderId)
          ? selectedProviderId
          : result[0]?.provider.id ?? "";
      setSelectedProviderId(nextId);
      setDetail(
        nextId
          ? await getProviderTestabilityProvider({
              data: { operatorToken, providerId: nextId },
            })
          : null,
      );
    } catch (cause) {
      setProviders([]);
      setDetail(null);
      setError(cause instanceof Error ? cause.message : "Provider testability request failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadProvider(providerId: string): Promise<void> {
    setSelectedProviderId(providerId);
    setMessage(null);
    if (!operatorToken || !providerId) {
      setDetail(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setDetail(
        await getProviderTestabilityProvider({
          data: { operatorToken, providerId },
        }),
      );
    } catch (cause) {
      setDetail(null);
      setError(cause instanceof Error ? cause.message : "Provider detail request failed");
    } finally {
      setBusy(false);
    }
  }

  async function record(): Promise<void> {
    if (!operatorToken || !selectedProviderId || !sourceTitle.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const inputPriceValue = optionalNumber(inputPrice);
      const outputPriceValue = optionalNumber(outputPrice);
      const requestPriceValue = optionalNumber(requestPrice);
      const pricing =
        currency.trim() &&
        (inputPriceValue !== undefined ||
          outputPriceValue !== undefined ||
          requestPriceValue !== undefined)
          ? {
              currency: currency.trim().toUpperCase(),
              ...(inputPriceValue !== undefined ? { inputPerMillion: inputPriceValue } : {}),
              ...(outputPriceValue !== undefined ? { outputPerMillion: outputPriceValue } : {}),
              ...(requestPriceValue !== undefined ? { perRequest: requestPriceValue } : {}),
            }
          : undefined;

      await recordProviderTestabilityObservation({
        data: {
          operatorToken,
          providerId: selectedProviderId,
          ...(modelId ? { modelId } : {}),
          subjectKind,
          accessState,
          registrationRequirement,
          billingRequirement,
          regionPolicy,
          ...(allowedRegions.trim() ? { allowedRegions: tags(allowedRegions) } : {}),
          ...(blockedRegions.trim() ? { blockedRegions: tags(blockedRegions) } : {}),
          ...(accountTier.trim() ? { accountTier: accountTier.trim() } : {}),
          ...(serviceTier.trim() ? { serviceTier: serviceTier.trim() } : {}),
          serviceAssurance,
          ...(pricing ? { pricing } : {}),
          source: {
            sourceType,
            ...(sourceUrl.trim() ? { url: sourceUrl.trim() } : {}),
            title: sourceTitle.trim(),
            ...(sourceSha.trim() ? { contentSha256: sourceSha.trim() } : {}),
          },
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });

      setMessage("Append-only testability observation recorded.");
      setNote("");
      const refreshed = await getProviderTestabilityProvider({
        data: { operatorToken, providerId: selectedProviderId },
      });
      setDetail(refreshed);
      setProviders(
        await getProviderTestabilityProviders({
          data: { operatorToken },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Observation record failed");
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
            <small>Provider Testability Registry</small>
          </span>
        </a>
        <nav className="integrity-nav">
          <a href="/">Run control</a>
          <a href="/catalog-integrity">Catalog Integrity</a>
          <a href="/catalog-coverage">Coverage</a>
        </nav>
      </header>

      <section className="hero integrity-hero testability-hero">
        <div>
          <p className="eyebrow">OPERATOR / ARCHIVE v0.18</p>
          <h1>
            A successful API call is evidence.
            <br />
            It is not automatically a fair comparison.
          </h1>
          <p className="hero-copy">
            Archive provider access, registration, region, billing, account/service tier,
            pricing, and execution-environment uncertainty as sourced observations.
            Missing evidence stays unknown; suspected degradation stays a caveat until
            later calibration and replication can support it.
          </p>
        </div>
        <div className="hero-stats">
          <div><strong>{providers.length || "—"}</strong><span>providers</span></div>
          <div><strong>{providers.reduce((sum, item) => sum + item.currentObservationCount, 0) || "—"}</strong><span>current observations</span></div>
          <div><strong>{providers.reduce((sum, item) => sum + item.uncertainServiceCount, 0) || "—"}</strong><span>uncertain environments</span></div>
        </div>
      </section>

      <section className="section control-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">ACCESS</p>
            <h2>Load testability matrix</h2>
          </div>
          <span className={providers.length ? "badge badge-pass" : "badge"}>
            {providers.length ? "registry loaded" : "operator locked"}
          </span>
        </div>
        <div className="control-grid testability-access-grid">
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
            <button type="button" disabled={busy || !operatorToken} onClick={() => void loadProviders()}>
              {busy ? "Loading…" : "Load registry"}
            </button>
          </div>
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
        {message ? <p className="success-banner">{message}</p> : null}
      </section>

      {providers.length ? (
        <section className="section">
          <div className="section-heading">
            <div><p className="eyebrow">MATRIX</p><h2>Provider evidence coverage</h2></div>
            <span className="badge">no readiness score</span>
          </div>
          <div className="testability-provider-grid">
            {providers.map((item) => (
              <button
                type="button"
                key={item.provider.id}
                className={
                  item.provider.id === selectedProviderId
                    ? "testability-provider-card selected"
                    : "testability-provider-card"
                }
                onClick={() => void loadProvider(item.provider.id)}
              >
                <strong>{item.provider.name}</strong>
                <small>{item.provider.slug} · {item.modelCount} models</small>
                <div className="testability-card-facts">
                  <span>{item.providerPolicyCount} policy</span>
                  <span>{item.runnerAccessCount} runner</span>
                  <span>{item.restrictedOrUnavailableCount} restricted</span>
                  <span>{item.uncertainServiceCount} uncertain</span>
                </div>
                <small>latest {stamp(item.latestObservedAt)}</small>
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
                <p className="eyebrow">CURRENT PROJECTION</p>
                <h2>{detail.provider.name}</h2>
              </div>
              <span className="badge">projected {stamp(detail.generatedAt)}</span>
            </div>
            {detail.summary.providerPolicyCount === 0 || detail.summary.runnerAccessCount === 0 ? (
              <div className="notice notice-error">
                Missing testability evidence:
                {detail.summary.providerPolicyCount === 0 ? " provider policy" : ""}
                {detail.summary.providerPolicyCount === 0 &&
                detail.summary.runnerAccessCount === 0
                  ? " +"
                  : ""}
                {detail.summary.runnerAccessCount === 0 ? " runner access" : ""}.
                The registry does not assume normal conditions.
              </div>
            ) : null}
            <div className="integrity-list">
              {detail.current.map((item) => (
                <article className="integrity-row" key={item.id}>
                  <div className="integrity-title-line">
                    <strong>
                      {item.subjectKind.replaceAll("_", " ")}
                      {item.model ? " · " + item.model.marketingName : " · provider-wide"}
                    </strong>
                    <div className="run-verdict">
                      <span className={accessClass(item.accessState)}>{item.accessState}</span>
                      <span className={assuranceClass(item.serviceAssurance)}>
                        {item.serviceAssurance.replaceAll("_", " ")}
                      </span>
                    </div>
                  </div>
                  <dl className="integrity-facts">
                    <dt>Observed</dt><dd>{stamp(item.observedAt)}</dd>
                    <dt>Registration</dt><dd>{item.registrationRequirement.replaceAll("_", " ")}</dd>
                    <dt>Billing</dt><dd>{item.billingRequirement.replaceAll("_", " ")}</dd>
                    <dt>Region policy</dt><dd>{item.regionPolicy.replaceAll("_", " ")}</dd>
                    <dt>Account tier</dt><dd>{item.accountTier ?? "—"}</dd>
                    <dt>Service tier</dt><dd>{item.serviceTier ?? "—"}</dd>
                    <dt>Allowed regions</dt><dd>{item.allowedRegions.join(", ") || "—"}</dd>
                    <dt>Blocked regions</dt><dd>{item.blockedRegions.join(", ") || "—"}</dd>
                  </dl>
                  {item.pricing ? (
                    <p>
                      Pricing evidence: {item.pricing.currency} · input{" "}
                      {item.pricing.inputPerMillion ?? "—"} / 1M · output{" "}
                      {item.pricing.outputPerMillion ?? "—"} / 1M · request{" "}
                      {item.pricing.perRequest ?? "—"}
                    </p>
                  ) : null}
                  <p>
                    Source: {item.source.title ?? item.source.sourceType} · retrieved{" "}
                    {stamp(item.source.retrievedAt)}
                  </p>
                  {item.source.url ? (
                    <a className="text-link" href={item.source.url} target="_blank" rel="noreferrer">
                      Open evidence ↗
                    </a>
                  ) : null}
                </article>
              ))}
              {detail.current.length === 0 ? (
                <p className="empty-state">
                  No provider-policy or runner-access observation has been recorded yet.
                </p>
              ) : null}
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">APPEND OBSERVATION</p><h2>Record access / cost evidence</h2></div>
              <span className="badge">append-only</span>
            </div>
            <div className="testability-form-grid">
              <label>
                <span>Scope</span>
                <select value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={busy}>
                  <option value="">Provider-wide</option>
                  {detail.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.marketingName} · {model.canonicalSlug}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Subject</span>
                <select value={subjectKind} onChange={(event) => setSubjectKind(event.target.value as ProviderTestabilitySubjectKind)} disabled={busy}>
                  <option value="provider_policy">Provider policy</option>
                  <option value="runner_access">Runner access</option>
                </select>
              </label>
              <label>
                <span>Access</span>
                <select value={accessState} onChange={(event) => setAccessState(event.target.value as ProviderTestabilityAccessState)} disabled={busy}>
                  <option value="unknown">Unknown</option>
                  <option value="available">Available</option>
                  <option value="restricted">Restricted</option>
                  <option value="unavailable">Unavailable</option>
                </select>
              </label>
              <label>
                <span>Registration</span>
                <select value={registrationRequirement} onChange={(event) => setRegistrationRequirement(event.target.value)} disabled={busy}>
                  <option value="unknown">Unknown</option>
                  <option value="open_signup">Open signup</option>
                  <option value="restricted_signup">Restricted signup</option>
                  <option value="invite_only">Invite only</option>
                  <option value="enterprise_only">Enterprise only</option>
                </select>
              </label>
              <label>
                <span>Billing</span>
                <select value={billingRequirement} onChange={(event) => setBillingRequirement(event.target.value)} disabled={busy}>
                  <option value="unknown">Unknown</option>
                  <option value="free">Free</option>
                  <option value="paid_account">Paid account</option>
                  <option value="prepaid_credit">Prepaid credit</option>
                  <option value="subscription">Subscription</option>
                  <option value="enterprise_contract">Enterprise contract</option>
                </select>
              </label>
              <label>
                <span>Region policy</span>
                <select value={regionPolicy} onChange={(event) => setRegionPolicy(event.target.value)} disabled={busy}>
                  <option value="unknown">Unknown</option>
                  <option value="unrestricted">Unrestricted</option>
                  <option value="restricted">Restricted</option>
                </select>
              </label>
              <label>
                <span>Allowed regions</span>
                <input value={allowedRegions} onChange={(event) => setAllowedRegions(event.target.value)} placeholder="US, JP" disabled={busy} />
              </label>
              <label>
                <span>Blocked regions</span>
                <input value={blockedRegions} onChange={(event) => setBlockedRegions(event.target.value)} placeholder="country / jurisdiction tags" disabled={busy} />
              </label>
              <label>
                <span>Account tier</span>
                <input value={accountTier} onChange={(event) => setAccountTier(event.target.value)} placeholder="non-secret tier only" disabled={busy} />
              </label>
              <label>
                <span>Service tier</span>
                <input value={serviceTier} onChange={(event) => setServiceTier(event.target.value)} placeholder="documented/observed tier" disabled={busy} />
              </label>
              <label>
                <span>Service assurance</span>
                <select value={serviceAssurance} onChange={(event) => setServiceAssurance(event.target.value as ProviderTestabilityServiceAssurance)} disabled={busy}>
                  <option value="unknown">Unknown</option>
                  <option value="documented_default">Documented default</option>
                  <option value="documented_variant">Documented variant</option>
                  <option value="operator_uncertain">Operator uncertain</option>
                </select>
              </label>
              <label>
                <span>Pricing currency</span>
                <input value={currency} onChange={(event) => setCurrency(event.target.value)} placeholder="USD / CNY" maxLength={3} disabled={busy} />
              </label>
              <label>
                <span>Input / 1M</span>
                <input inputMode="decimal" value={inputPrice} onChange={(event) => setInputPrice(event.target.value)} placeholder="optional" disabled={busy} />
              </label>
              <label>
                <span>Output / 1M</span>
                <input inputMode="decimal" value={outputPrice} onChange={(event) => setOutputPrice(event.target.value)} placeholder="optional" disabled={busy} />
              </label>
              <label>
                <span>Per request</span>
                <input inputMode="decimal" value={requestPrice} onChange={(event) => setRequestPrice(event.target.value)} placeholder="optional" disabled={busy} />
              </label>
              <label>
                <span>Source type</span>
                <select value={sourceType} onChange={(event) => setSourceType(event.target.value as typeof sourceType)} disabled={busy}>
                  <option value="provider_policy">Provider policy</option>
                  <option value="provider_docs">Provider docs</option>
                  <option value="provider_pricing">Provider pricing</option>
                  <option value="operator_verification">Operator verification</option>
                </select>
              </label>
              <label>
                <span>Source URL</span>
                <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder={sourceType === "operator_verification" ? "optional" : "https://…"} disabled={busy} />
              </label>
              <label>
                <span>Source title</span>
                <input value={sourceTitle} onChange={(event) => setSourceTitle(event.target.value)} placeholder="required" disabled={busy} />
              </label>
              <label>
                <span>Content SHA-256</span>
                <input value={sourceSha} onChange={(event) => setSourceSha(event.target.value)} placeholder="optional lowercase SHA-256" disabled={busy} />
              </label>
            </div>
            <label className="testability-note">
              <span>Operator note</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                placeholder="Record what was verified. Never include credentials or personal account identifiers."
                disabled={busy}
              />
            </label>
            <div className="execute-bar">
              <div>
                <strong>Observation, not verdict</strong>
                <small>
                  Use operator_uncertain for a possibly non-representative environment.
                  Do not label a model degraded from one result.
                </small>
              </div>
              <button type="button" disabled={busy || !sourceTitle.trim()} onClick={() => void record()}>
                {busy ? "Recording…" : "Append observation"}
              </button>
            </div>
          </section>

          <section className="section">
            <div className="section-heading">
              <div><p className="eyebrow">HISTORY</p><h2>Observation ledger</h2></div>
              <span className="badge">{detail.history.length} loaded</span>
            </div>
            <div className="identity-timeline">
              {detail.history.map((item) => (
                <article className="identity-event" key={item.id}>
                  <div className="identity-event-time">{stamp(item.observedAt)}</div>
                  <div className="identity-event-body">
                    <span className={accessClass(item.accessState)}>{item.accessState}</span>
                    <strong>
                      {item.subjectKind.replaceAll("_", " ")}
                      {item.model ? " · " + item.model.marketingName : " · provider"}
                    </strong>
                    <small>{item.serviceAssurance.replaceAll("_", " ")}</small>
                    {item.note ? <p>{item.note}</p> : null}
                  </div>
                  <div className="identity-event-source">
                    <span>{item.source.sourceType}</span>
                    <strong>{item.source.title ?? "—"}</strong>
                    <small>{item.actor}</small>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : selectedSummary ? (
        <section className="section">
          <p className="empty-state">Provider detail is not available.</p>
        </section>
      ) : null}

      <section className="section">
        <div className="section-heading">
          <div><p className="eyebrow">BOUNDARY</p><h2>Testability is not model quality</h2></div>
        </div>
        <p className="section-intro">
          v0.18 records access, cost, region, tier, and environment evidence. It does not
          block Runs, calculate cost, choose a credential or region, declare comparability,
          or infer deliberate/accidental model degradation. Those layers are staged in the
          revised Archive roadmap.
        </p>
      </section>
    </main>
  );
}
