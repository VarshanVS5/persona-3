// Settings_Store (Req 3, 4). Non-secret UI settings only; unknown keys are dropped so secrets can never be persisted.
import { redact, REDACTED } from "./redactor";

export type AppMode = "mock" | "live";

export interface Settings {
  version: 1;
  firstLaunchComplete: boolean;
  mode: AppMode | null;
  host: string;
  port: number;
  inactivityTimeoutSec: number;
  reducedMotionOverride: boolean;
  confirmBeforeClose: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  firstLaunchComplete: false,
  mode: null,
  host: "127.0.0.1",
  port: 8765,
  inactivityTimeoutSec: 30,
  reducedMotionOverride: false,
  confirmBeforeClose: true,
};

export const TIMEOUT_RANGE = { min: 10, max: 120 } as const;
export const REQUIRED_HOST = "127.0.0.1";

export function validateHost(host: unknown): string | null {
  return host === REQUIRED_HOST ? null : `Host must be ${REQUIRED_HOST}`;
}

export function validatePort(port: unknown): string | null {
  const n = typeof port === "string" && /^\d+$/.test(port.trim()) ? Number(port) : port;
  return typeof n === "number" && Number.isInteger(n) && n >= 1024 && n <= 65535 ? null : "Port must be a whole number from 1024 to 65535";
}

export function validateTimeout(v: unknown): string | null {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= TIMEOUT_RANGE.min && n <= TIMEOUT_RANGE.max
    ? null
    : `Permitted range: ${TIMEOUT_RANGE.min} to ${TIMEOUT_RANGE.max} seconds`;
}

export interface ParseResult {
  settings: Settings;
  /** Names of fields that were reset to defaults. */
  resetFields: string[];
  /** True when the entire file was unusable (missing/unreadable/invalid) and defaults were used. */
  wholeFileReset: boolean;
  missing: boolean;
}

export function serializeSettings(s: Settings): string {
  const clean: Settings = {
    version: 1,
    firstLaunchComplete: s.firstLaunchComplete,
    mode: s.mode,
    host: s.host,
    port: s.port,
    inactivityTimeoutSec: s.inactivityTimeoutSec,
    reducedMotionOverride: s.reducedMotionOverride,
    confirmBeforeClose: s.confirmBeforeClose,
  };
  return JSON.stringify(clean, null, 2);
}

export function parseSettings(raw: string | null): ParseResult {
  if (raw === null) return { settings: { ...DEFAULT_SETTINGS }, resetFields: [], wholeFileReset: false, missing: true };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, resetFields: [], wholeFileReset: true, missing: false };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { settings: { ...DEFAULT_SETTINGS }, resetFields: [], wholeFileReset: true, missing: false };
  }
  const d = data as Record<string, unknown>;
  const out: Settings = { ...DEFAULT_SETTINGS };
  const reset: string[] = [];
  const take = <K extends keyof Settings>(key: K, ok: (v: unknown) => boolean): void => {
    if (!(key in d)) return;
    if (ok(d[key])) (out as unknown as Record<string, unknown>)[key] = d[key];
    else reset.push(key);
  };
  take("firstLaunchComplete", (v) => typeof v === "boolean");
  take("mode", (v) => v === null || v === "mock" || v === "live");
  take("host", (v) => validateHost(v) === null);
  take("port", (v) => typeof v === "number" && validatePort(v) === null);
  take("inactivityTimeoutSec", (v) => typeof v === "number" && validateTimeout(v) === null);
  take("reducedMotionOverride", (v) => typeof v === "boolean");
  take("confirmBeforeClose", (v) => typeof v === "boolean");
  // A completed first launch without a mode is inconsistent: force the flow again.
  if (out.firstLaunchComplete && out.mode === null) {
    out.firstLaunchComplete = false;
    reset.push("mode");
  }
  return { settings: out, resetFields: reset, wholeFileReset: false, missing: false };
}

export function settingsEqual(a: Settings, b: Settings): boolean {
  return serializeSettings(a) === serializeSettings(b);
}

/** True if any serialized value would be changed by redaction, i.e. looks like a secret. */
export function containsSecretPattern(s: Settings): boolean {
  const text = serializeSettings(s);
  return redact(text) !== text || text.includes(REDACTED);
}

// ---------------- Storage ----------------

export interface SettingsStorage {
  read(): Promise<string | null>;
  write(contents: string): Promise<void>;
  readonly kind: "tauri-app-data" | "browser-local-storage";
}

const LS_KEY = "atlas.desktop-ui.settings";

export const browserStorage: SettingsStorage = {
  kind: "browser-local-storage",
  async read() {
    return window.localStorage.getItem(LS_KEY);
  },
  async write(contents) {
    window.localStorage.setItem(LS_KEY, contents);
  },
};

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function createTauriStorage(): Promise<SettingsStorage> {
  const { invoke } = await import("@tauri-apps/api/core");
  return {
    kind: "tauri-app-data",
    async read() {
      return (await invoke<string | null>("load_settings")) ?? null;
    },
    async write(contents) {
      await invoke("save_settings", { contents });
    },
  };
}

export async function getDefaultStorage(): Promise<SettingsStorage> {
  return isTauri() ? createTauriStorage() : browserStorage;
}
