import { MODE_LABEL, type ModeKind } from "../../lib/mode";
import type { StreamState } from "../../hooks/useAtlas";

const ICON: Record<ModeKind, string> = { mock: "[M]", "backend-mock": "[S]", live: "[L]", disconnected: "[!]", checking: "[...]" };

/** Mode_Indicator: always visible, exactly one label (Req 5.1). Text + icon + color. */
export function ModeIndicator({ kind, error }: { kind: ModeKind; error?: string }) {
  return (
    <div className={`mode-banner mode-${kind}`} role="status" data-testid="mode-indicator">
      <span aria-hidden="true">{ICON[kind]}</span> <strong>{MODE_LABEL[kind]}</strong>
      {kind === "mock" && <span> - fixtures only, nothing is executed on this computer.</span>}
      {kind === "backend-mock" && <span> - the backend simulates actions.</span>}
      {kind === "disconnected" && <span> - the backend is unreachable{error ? ` (${error})` : ""}. ATLAS does not switch to mock mode by itself.</span>}
    </div>
  );
}

export function ConnectionNotice({ stream, active }: { stream: StreamState; active: boolean }) {
  if (!active) return null;
  if (stream === "reconnecting") return <p className="notice warn" role="status">Reconnecting - event stream lost, still checking the backend.</p>;
  if (stream === "polling") return <p className="notice warn" role="status">Event stream unavailable, polling the backend every 2 seconds.</p>;
  return null;
}

/** Visually hidden live region announcing timeline/result changes (Req 17.5). */
export function LiveAnnouncer({ message }: { message: string }) {
  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-testid="live-region">
      {message}
    </div>
  );
}
