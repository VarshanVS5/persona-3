import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, parseSettings, serializeSettings, type Settings, type SettingsStorage } from "../lib/settings";

export interface SettingsApi {
  settings: Settings;
  loaded: boolean;
  notices: string[];
  saveError: string | null;
  storageKind: SettingsStorage["kind"] | "unknown";
  /** Persists a patch. Resolves false if the write failed (the file is left unchanged). */
  save: (patch: Partial<Settings>, opts?: { strict?: boolean }) => Promise<boolean>;
  dismissNotice: (n: string) => void;
}

export function useSettings(storage: SettingsStorage | null): SettingsApi {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const [loaded, setLoaded] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const current = useRef<Settings>(settings);
  current.current = settings;

  useEffect(() => {
    if (!storage) return;
    let alive = true;
    void (async () => {
      let raw: string | null = null;
      let readFailed = false;
      try {
        raw = await storage.read();
      } catch {
        readFailed = true;
      }
      if (!alive) return;
      const parsed = readFailed ? { ...parseSettings("not json"), missing: false } : parseSettings(raw);
      const msgs: string[] = [];
      if (parsed.wholeFileReset) msgs.push("Settings could not be read and were reset to defaults.");
      if (parsed.resetFields.length > 0) msgs.push(`These settings were invalid and were reset: ${parsed.resetFields.join(", ")}.`);
      setSettings(parsed.settings);
      setNotices(msgs);
      setLoaded(true);
      if (parsed.resetFields.length > 0 && !parsed.wholeFileReset) {
        // Replace the invalid values only after the notice is queued for display.
        try {
          await storage.write(serializeSettings(parsed.settings));
        } catch {
          setSaveError("Corrected settings could not be saved.");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [storage]);

  const save = useCallback(
    async (patch: Partial<Settings>, opts?: { strict?: boolean }): Promise<boolean> => {
      const next: Settings = { ...current.current, ...patch };
      // strict: only adopt the new settings once they are safely written (first-launch completion).
      if (!opts?.strict) {
        setSettings(next);
        current.current = next;
      }
      if (!storage) return false;
      try {
        await storage.write(serializeSettings(next));
        if (opts?.strict) {
          setSettings(next);
          current.current = next;
        }
        setSaveError(null);
        return true;
      } catch {
        setSaveError("The setting was not saved. Check disk space and folder permissions.");
        return false;
      }
    },
    [storage],
  );

  return {
    settings,
    loaded,
    notices,
    saveError,
    storageKind: storage?.kind ?? "unknown",
    save,
    dismissNotice: (n) => setNotices((l) => l.filter((x) => x !== n)),
  };
}
