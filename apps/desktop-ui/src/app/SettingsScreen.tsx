import { useState } from "react";
import registry from "../../../../packages/contracts/action-registry.json";
import { buildDiagnostics } from "../lib/diagnostics";
import { BUILD_INFO } from "../lib/info";
import { redact } from "../lib/redactor";
import { MODE_LABEL, type BackendStatus, type ModeKind } from "../lib/mode";
import { validateTimeout, TIMEOUT_RANGE, type AppMode, type Settings } from "../lib/settings";
import type { StreamState } from "../hooks/useAtlas";

export interface SettingsScreenProps {
  settings: Settings;
  save: (patch: Partial<Settings>) => Promise<boolean>;
  saveError: string | null;
  storageKind: string;
  modeKind: ModeKind;
  backend: BackendStatus;
  stream: StreamState;
  diagnostics: string[];
}

interface RegistryAction {
  actionType: string;
  riskTier: string;
  description: string;
}

export function SettingsScreen(p: SettingsScreenProps) {
  const [timeoutText, setTimeoutText] = useState(String(p.settings.inactivityTimeoutSec));
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);
  const actions = registry.actions as RegistryAction[];
  const blocked = registry.blocked as Array<{ category: string; reason: string }>;
  const url = `http://${p.settings.host}:${p.settings.port}`;

  const onTimeout = async (text: string) => {
    setTimeoutText(text);
    const err = validateTimeout(text);
    setTimeoutError(err);
    if (err === null) {
      const ok = await p.save({ inactivityTimeoutSec: Number(text) });
      setSaved(ok ? `Saved: ${text} seconds` : null);
    } else {
      setSaved(null); // previously saved value is retained
    }
  };

  const copy = async () => {
    const text = buildDiagnostics({
      backendUrl: url,
      mode: MODE_LABEL[p.modeKind],
      backend: p.backend,
      stream: p.stream,
      voiceAvailable: false,
      entries: p.diagnostics,
      version: BUILD_INFO.version || "unknown",
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopyMsg("Diagnostics copied (secrets redacted).");
    } catch {
      setCopyMsg("Copy failed. Nothing was copied.");
    }
  };

  const switchMode = (m: AppMode) => {
    if (m !== p.settings.mode) void p.save({ mode: m });
  };

  return (
    <section aria-labelledby="settings-h" className="panel wide">
      <h1 id="settings-h">Settings</h1>
      <p className="help">Stored in: {p.storageKind === "tauri-app-data" ? "the app data folder" : "browser storage (development only)"}.</p>
      {p.saveError && (
        <p role="alert" className="error-text">
          {p.saveError}
        </p>
      )}

      <h2>Mode</h2>
      <fieldset>
        <legend>Run mode (switching clears the current task view)</legend>
        <label className="radio">
          <input type="radio" name="s-mode" checked={p.settings.mode === "mock"} onChange={() => switchMode("mock")} />
          <span>Mock mode - fixtures, nothing executed</span>
        </label>
        <label className="radio">
          <input type="radio" name="s-mode" checked={p.settings.mode === "live"} onChange={() => switchMode("live")} />
          <span>Live mode - local backend at {url}</span>
        </label>
      </fieldset>

      <h2>Execution preferences</h2>
      <div className="form-row">
        <label htmlFor="s-timeout">Inactivity timeout (seconds)</label>
        <input id="s-timeout" inputMode="numeric" value={timeoutText} onChange={(e) => void onTimeout(e.target.value)} aria-invalid={timeoutError !== null} aria-describedby="s-timeout-msg" />
        <span id="s-timeout-msg" role={timeoutError ? "alert" : "status"} className={timeoutError ? "error-text" : "help"}>
          {timeoutError ?? saved ?? `Allowed: ${TIMEOUT_RANGE.min} to ${TIMEOUT_RANGE.max}`}
        </span>
      </div>
      <label className="check">
        <input type="checkbox" checked={p.settings.reducedMotionOverride} onChange={(e) => void p.save({ reducedMotionOverride: e.target.checked })} /> Always reduce motion
      </label>
      <label className="check">
        <input type="checkbox" checked={p.settings.confirmBeforeClose} onChange={(e) => void p.save({ confirmBeforeClose: e.target.checked })} /> Ask before closing the window during a task
      </label>

      <h2>Providers</h2>
      <p className="help">The backend does not report provider status yet.</p>
      <ul>
        <li>9Router: unknown</li>
        <li>Amazon Transcribe: unknown</li>
        <li>Amazon Polly: unknown</li>
      </ul>
      <p>Providers and their keys are configured in the backend .env file (see .env.example). ATLAS never asks for or stores API keys.</p>

      <h2>Permissions (read-only)</h2>
      <p className="help">From the shared action registry. The backend enforces these; this window cannot change them.</p>
      <h3>Allowed actions</h3>
      <ul>
        {actions.map((a) => (
          <li key={a.actionType}>
            {a.actionType} ({a.riskTier}) - {a.description}
          </li>
        ))}
      </ul>
      <h3>Blocked categories</h3>
      <ul>
        {blocked.map((b) => (
          <li key={b.category}>
            {b.category} - {b.reason}
          </li>
        ))}
      </ul>
      <p>Allowlisted applications: Not reported by backend</p>
      <p>Approved directories: Not reported by backend</p>

      <h2>Diagnostics</h2>
      <dl className="kv">
        <dt>Backend URL</dt>
        <dd>{url}</dd>
        <dt>Health</dt>
        <dd>{p.modeKind === "mock" ? "not applicable in mock mode" : p.backend.state === "ok" ? `ok (${p.backend.latencyMs} ms)` : p.backend.state === "checking" ? "checking" : "unreachable"}</dd>
        <dt>Backend mockMode</dt>
        <dd>{p.backend.mockMode === null ? "unknown" : String(p.backend.mockMode)}</dd>
        <dt>Event stream</dt>
        <dd>{p.stream}</dd>
        <dt>Voice</dt>
        <dd>Voice unavailable - typed input is active</dd>
      </dl>
      <h3>Recent diagnostics</h3>
      {p.diagnostics.length === 0 ? (
        <p className="empty">No diagnostics recorded.</p>
      ) : (
        <ul className="diag">
          {p.diagnostics.slice(-20).map((d, i) => (
            <li key={i}>{redact(d)}</li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => void copy()}>
        Copy diagnostics
      </button>
      {copyMsg && (
        <p role="status" className="help">
          {copyMsg}
        </p>
      )}
    </section>
  );
}
