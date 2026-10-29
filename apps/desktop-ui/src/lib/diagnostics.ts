import { redact } from "./redactor";
import type { BackendStatus } from "./mode";
import type { StreamState } from "../hooks/useAtlas";

export interface DiagnosticsInput {
  backendUrl: string;
  mode: string;
  backend: BackendStatus;
  stream: StreamState;
  voiceAvailable: boolean;
  entries: string[];
  version: string;
}

export function buildDiagnostics(d: DiagnosticsInput): string {
  const health =
    d.backend.state === "ok"
      ? `ok (${d.backend.latencyMs ?? "?"} ms)`
      : d.backend.state === "checking"
        ? "checking"
        : "unreachable";
  const lines = [
    `ATLAS desktop UI ${d.version}`,
    `Mode: ${d.mode}`,
    `Backend URL: ${d.backendUrl}`,
    `Health: ${health}`,
    `Backend mockMode: ${d.backend.mockMode === null ? "unknown" : String(d.backend.mockMode)}`,
    `Event stream: ${d.stream}`,
    d.voiceAvailable ? "Voice: available" : "Voice unavailable - typed input is active",
    "Recent diagnostics:",
    ...d.entries.slice(-20).map((e) => `  - ${e}`),
  ];
  return redact(lines.join("\n"));
}
