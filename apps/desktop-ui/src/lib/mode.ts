import type { AppMode } from "./settings";

export type ModeKind = "mock" | "backend-mock" | "live" | "disconnected" | "checking";

export interface BackendStatus {
  state: "checking" | "ok" | "unreachable";
  mockMode: boolean | null;
  latencyMs: number | null;
  error?: string;
}

export const MODE_LABEL: Record<ModeKind, string> = {
  mock: "Mock mode (UI fixtures)",
  "backend-mock": "Backend mock mode (simulated execution)",
  live: "Live mode",
  disconnected: "Disconnected",
  checking: "Checking backend...",
};

export const RESULT_LABEL: Partial<Record<ModeKind, string>> = {
  mock: "MOCK - nothing was executed",
  "backend-mock": "SIMULATED by backend",
};

export function deriveModeKind(mode: AppMode, backend: BackendStatus): ModeKind {
  if (mode === "mock") return "mock";
  if (backend.state === "checking") return "checking";
  if (backend.state === "unreachable") return "disconnected";
  return backend.mockMode ? "backend-mock" : "live";
}
