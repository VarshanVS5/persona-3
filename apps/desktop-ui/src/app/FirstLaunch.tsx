import { useState } from "react";
import { PRIVACY_DISCLOSURE, PRIVACY_FOOTNOTE } from "../lib/info";
import { validateHost, validatePort, type AppMode } from "../lib/settings";
import { AtlasClient } from "../services/atlasClient";
import { ClientError, type AtlasClientApi } from "../services/client";
import type { Settings } from "../lib/settings";

type HealthState = { phase: "idle" } | { phase: "checking" } | { phase: "ok"; mockMode: boolean } | { phase: "error"; message: string };

export interface FirstLaunchProps {
  initial: Settings;
  notices: string[];
  save: (patch: Partial<Settings>, opts?: { strict?: boolean }) => Promise<boolean>;
  /** Overridable for tests. */
  makeClient?: (host: string, port: number) => AtlasClientApi;
}

export function FirstLaunch({ initial, notices, save, makeClient }: FirstLaunchProps) {
  const [read, setRead] = useState(false);
  const [mode, setMode] = useState<AppMode | null>(null);
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port));
  const [health, setHealth] = useState<HealthState>({ phase: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);

  const hostError = validateHost(host);
  const portError = validatePort(port);
  const fieldsValid = hostError === null && portError === null;

  const check = async () => {
    if (!fieldsValid) return;
    setHealth({ phase: "checking" });
    try {
      const client = makeClient ? makeClient(host, Number(port)) : new AtlasClient({ host, port: Number(port) });
      const h = await client.health();
      setHealth({ phase: "ok", mockMode: h.mockMode });
    } catch (e) {
      const m = e instanceof ClientError ? `${e.category}: ${e.message}` : "unexpected error";
      setHealth({ phase: "error", message: m });
    }
  };

  const choose = (m: AppMode) => {
    setMode(m);
    setSaveError(null);
    if (m === "live") void check();
    else setHealth({ phase: "idle" });
  };

  const canContinue = read && mode !== null && fieldsValid && (mode === "mock" || health.phase === "ok");

  const onContinue = async () => {
    if (!mode) return;
    const ok = await save({ mode, host, port: Number(port), firstLaunchComplete: true }, { strict: true });
    if (!ok) setSaveError("Your choice could not be saved. Check disk space and permissions, then try again.");
  };

  return (
    <main className="first-launch" aria-labelledby="fl-h">
      <h1 id="fl-h">Welcome to Project ATLAS</h1>
      {notices.map((n) => (
        <p key={n} className="notice warn" role="status">
          {n}
        </p>
      ))}
      <p>ATLAS turns a typed request into a plan, asks you to approve it, and reports what actually happened. Choose how to start.</p>

      <section aria-labelledby="fl-privacy">
        <h2 id="fl-privacy">What leaves this computer</h2>
        <ul>
          {PRIVACY_DISCLOSURE.map((p) => (
            <li key={p.provider}>
              <strong>{p.feature}</strong> uses {p.provider}. {p.data}
            </li>
          ))}
        </ul>
        <p>{PRIVACY_FOOTNOTE}</p>
        <label className="check">
          <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} /> I have read this
        </label>
      </section>

      <fieldset disabled={!read}>
        <legend>Choose a mode</legend>
        <label className="radio">
          <input type="radio" name="mode" checked={mode === "mock"} onChange={() => choose("mock")} />
          <span>
            <strong>Mock mode</strong> - replays fixtures. Nothing is executed on this computer.
          </span>
        </label>
        <label className="radio">
          <input type="radio" name="mode" checked={mode === "live"} onChange={() => choose("live")} />
          <span>
            <strong>Live mode</strong> - connects to the local ATLAS backend, which performs real actions after your approval.
          </span>
        </label>
      </fieldset>

      {mode === "live" && (
        <section aria-labelledby="fl-backend">
          <h2 id="fl-backend">Backend connection</h2>
          <div className="form-row">
            <label htmlFor="fl-host">Host</label>
            <input id="fl-host" value={host} onChange={(e) => setHost(e.target.value)} aria-invalid={hostError !== null} aria-describedby="fl-host-err" />
            <span id="fl-host-err" className="error-text" role={hostError ? "alert" : undefined}>
              {hostError}
            </span>
          </div>
          <div className="form-row">
            <label htmlFor="fl-port">Port</label>
            <input id="fl-port" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} aria-invalid={portError !== null} aria-describedby="fl-port-err" />
            <span id="fl-port-err" className="error-text" role={portError ? "alert" : undefined}>
              {portError}
            </span>
          </div>
          <div aria-live="polite">
            {health.phase === "checking" && <p>Checking the backend...</p>}
            {health.phase === "ok" && (
              <p className="ok-text">
                Backend reachable. It reports mockMode: {String(health.mockMode)}.{" "}
                {health.mockMode ? "Actions will be simulated by the backend (Backend mock mode)." : "Actions will be real (Live mode)."}
              </p>
            )}
            {health.phase === "error" && (
              <div role="alert" className="error-text">
                <p>The backend check failed - {health.message}</p>
                <div className="button-row">
                  <button type="button" onClick={() => void check()}>
                    Retry
                  </button>
                  <button type="button" onClick={() => choose("mock")}>
                    Switch to Mock mode
                  </button>
                </div>
              </div>
            )}
          </div>
          {health.phase !== "checking" && (
            <button type="button" onClick={() => void check()} disabled={!fieldsValid}>
              Check backend
            </button>
          )}
        </section>
      )}

      {saveError && (
        <p role="alert" className="error-text">
          {saveError}
        </p>
      )}
      <button type="button" className="primary" disabled={!canContinue} onClick={() => void onContinue()}>
        Continue
      </button>
      <p className="help">ATLAS never asks for provider API keys. Those stay in the backend .env file.</p>
    </main>
  );
}
