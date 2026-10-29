// Result_Panel (Req 11, 12). Shows only what Backend evidence supports; no success indicator without it.
import type { TaskState } from "../../lib/eventReducer";
import { categorizeFailure, guidanceFor, stepOutcomeText, type Outcome } from "../../lib/outcome";
import { redact } from "../../lib/redactor";
import type { CancelState, StreamState } from "../../hooks/useAtlas";

export interface ResultPanelProps {
  state: TaskState;
  outcome: Outcome | null;
  modeLabel: string | null;
  mock: boolean;
  cancelable: boolean;
  cancelState: CancelState;
  cancelMessage: string | null;
  stale: boolean;
  stream: StreamState;
  onCancel: () => void;
  onRetryConnection: () => void;
}

export function cancelStatusText(state: TaskState, cancelState: CancelState): string | null {
  if (state.terminal?.type === "task_cancelled" || state.status === "CANCELLED") return "Cancellation confirmed";
  if (state.status === "CANCELLING") return "Cancelling - the current action may still finish";
  if (cancelState === "failed") return "Cancellation not confirmed";
  if (cancelState === "requested") return "Cancellation requested";
  return null;
}

export function ResultPanel(p: ResultPanelProps) {
  const { state, outcome } = p;
  const t = state.terminal;
  const failed = outcome?.label === "failed" || outcome?.label === "cancelled";
  const category = failed || state.providerError ? categorizeFailure(state) : null;
  const cancelText = cancelStatusText(state, p.cancelState);
  const confirmedCancel = cancelText === "Cancellation confirmed";
  const missing = outcome?.label === "completed" ? state.steps.filter((s) => !s.verified).map((s) => s.stepId) : [];
  const partial = outcome?.note === "partial";
  const showVerifiedIcon = outcome?.label === "verified" && outcome.evidence && !p.mock;

  return (
    <section aria-labelledby="result-h" className="panel">
      <h2 id="result-h">Result</h2>
      {p.modeLabel && <p className="mode-label">{p.modeLabel}</p>}
      {!outcome ? (
        <p className="empty">No result yet. Nothing has been reported by the backend.</p>
      ) : (
        <p className={`outcome outcome-${outcome.label}`} data-testid="outcome">
          <span aria-hidden="true">{showVerifiedIcon ? "[ok] " : ""}</span>
          <strong>Outcome: {outcome.label}</strong>
          {outcome.note && <span> ({outcome.note})</span>}
        </p>
      )}
      {outcome?.label === "completed" && missing.length > 0 && <p className="warn-text">Steps without verification evidence: {missing.join(", ")}.</p>}
      {partial && (
        <div className="partial">
          <p>
            <strong>Completed steps:</strong> {state.steps.filter((s) => s.verified).map((s) => s.stepId).join(", ") || "none"}
          </p>
          <p>
            <strong>Unfinished steps:</strong> {state.steps.filter((s) => !s.verified).map((s) => s.stepId).join(", ") || "none"}
          </p>
        </div>
      )}
      {state.steps.length > 0 && outcome && (
        <ul className="evidence">
          {state.steps.map((s) => (
            <li key={s.stepId}>
              Step {s.stepId}: {stepOutcomeText(s)}
            </li>
          ))}
        </ul>
      )}
      {(failed || state.providerError) && (
        <div role="alert" className="failure">
          {t?.reason && <p>Reason: {redact(t.reason)}</p>}
          {(t?.failedStepId !== undefined || state.steps.some((s) => s.state === "failed")) && (
            <p>Failed step: {t?.failedStepId ?? state.steps.find((s) => s.state === "failed")?.stepId}</p>
          )}
          {state.providerError && (
            <p>
              Provider {redact(state.providerError.provider)} reported {redact(state.providerError.code)}
              {state.providerError.message ? `: ${redact(state.providerError.message)}` : ""}
            </p>
          )}
          <p>
            <strong>What to do:</strong>
          </p>
          <ul>
            {guidanceFor(category).map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {state.compensationVerified && <p className="help">The backend reports a verified way to undo this action.</p>}

      {cancelText && (
        <p role="status" className={confirmedCancel ? "ok-text" : p.cancelState === "failed" ? "error-text" : "warn-text"} data-testid="cancel-status">
          {cancelText}
          {p.cancelState === "failed" && p.cancelMessage ? ` (${p.cancelMessage})` : ""}
        </p>
      )}
      {p.stale && (
        <div role="alert" className="warn-box">
          <p>No update from backend.</p>
          <div className="button-row">
            <button type="button" onClick={p.onCancel}>
              Cancel task
            </button>
            <button type="button" onClick={p.onRetryConnection}>
              Retry connection
            </button>
          </div>
        </div>
      )}
      {p.cancelable && !confirmedCancel && (
        <button type="button" className="danger" onClick={p.onCancel} disabled={p.cancelState === "requested"} aria-keyshortcuts="Control+.">
          {p.cancelState === "failed" ? "Retry cancel" : "Cancel task"}
        </button>
      )}
    </section>
  );
}
