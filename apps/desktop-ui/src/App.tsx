import { useEffect, useMemo, useState } from "react";
import { FirstLaunch } from "./app/FirstLaunch";
import { Workspace, type View } from "./app/Workspace";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { useSettings } from "./hooks/useSettings";
import { getDefaultStorage, type Settings, type SettingsStorage } from "./lib/settings";
import { AtlasClient } from "./services/atlasClient";
import type { AtlasClientApi } from "./services/client";
import { MockClient } from "./services/mockClient";

export interface AppProps {
  /** Tests inject storage / client factories. The product uses Tauri app data and the explicit mode. */
  storage?: SettingsStorage;
  createClient?: (s: Settings) => AtlasClientApi;
  pollMs?: number;
}

const NAV: Array<{ id: View; label: string }> = [
  { id: "task", label: "Task" },
  { id: "journal", label: "Audit journal" },
  { id: "settings", label: "Settings" },
  { id: "about", label: "About" },
];

export function defaultCreateClient(s: Settings): AtlasClientApi {
  // The client is chosen ONLY from the user's explicit mode (Req 18.10).
  return s.mode === "live" ? new AtlasClient({ host: s.host, port: s.port }) : new MockClient();
}

export function App({ storage: injected, createClient = defaultCreateClient, pollMs }: AppProps) {
  const [storage, setStorage] = useState<SettingsStorage | null>(injected ?? null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [view, setView] = useState<View>("task");

  useEffect(() => {
    if (injected) return;
    getDefaultStorage().then(setStorage, () => setStorageError("The settings location could not be opened."));
  }, [injected]);

  const settingsApi = useSettings(storage);
  const { settings, loaded } = settingsApi;
  const reduced = useReducedMotion(settings.reducedMotionOverride);

  const client = useMemo(
    () => (settings.firstLaunchComplete && settings.mode ? createClient(settings) : null),
    // Re-create (and remount the workspace) only when the mode/endpoint changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.firstLaunchComplete, settings.mode, settings.host, settings.port],
  );

  let body;
  if (storageError) {
    body = (
      <main className="first-launch">
        <p role="alert" className="error-text">
          {storageError}
        </p>
      </main>
    );
  } else if (!loaded) {
    body = (
      <main className="first-launch">
        <p role="status">Loading settings...</p>
      </main>
    );
  } else if (!settings.firstLaunchComplete || !client) {
    body = <FirstLaunch initial={settings} notices={settingsApi.notices} save={settingsApi.save} />;
  } else {
    body = (
      <>
        <header className="app-header">
          <span className="brand">Project ATLAS</span>
          <nav aria-label="Main">
            {NAV.map((n) => (
              <button key={n.id} type="button" className={`nav-btn${view === n.id ? " active" : ""}`} aria-current={view === n.id ? "page" : undefined} onClick={() => setView(n.id)}>
                {n.label}
              </button>
            ))}
          </nav>
        </header>
        {settingsApi.notices.map((n) => (
          <p key={n} className="notice warn" role="status">
            {n}{" "}
            <button type="button" onClick={() => settingsApi.dismissNotice(n)}>
              Dismiss
            </button>
          </p>
        ))}
        <Workspace key={`${settings.mode}-${settings.host}-${settings.port}`} settingsApi={settingsApi} client={client} view={view} {...(pollMs ? { pollMs } : {})} />
      </>
    );
  }

  return (
    <div className="app" data-reduced-motion={reduced ? "true" : "false"}>
      {body}
    </div>
  );
}
