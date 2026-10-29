// Execution_Timeline (Req 10). Step state comes only from Backend events; progress counts completed steps.
import { completedFraction, type StepState, type TaskState } from "../../lib/eventReducer";
import { stepOutcomeText } from "../../lib/outcome";
import { redact } from "../../lib/redactor";

const ICON: Record<StepState, string> = { pending: "o", running: ">", completed: "+", failed: "x", cancelled: "-" };

export function ExecutionLedger({ state, modeLabel }: { state: TaskState; modeLabel: string | null }) {
  const { done, total } = completedFraction(state);
  return (
    <section aria-labelledby="timeline-h" className="panel">
      <h2 id="timeline-h">Execution timeline</h2>
      {modeLabel && <p className="mode-label">{modeLabel}</p>}
      {state.steps.length === 0 ? (
        <p className="empty">No steps yet.</p>
      ) : (
        <>
          <p className="help" id="timeline-count">
            {done} of {total} steps completed
          </p>
          <progress max={total} value={done} aria-labelledby="timeline-count" />
          <ol className="timeline">
            {state.steps.map((s) => (
              <li key={s.stepId} className={`step step-${s.state}`}>
                <span className="step-icon" aria-hidden="true">
                  {ICON[s.state]}
                </span>
                <span className="step-name">
                  {s.stepId}. {redact(s.actionType)}
                </span>
                <span className={`pill pill-${s.state}`}>{s.state}</span>
                <span className="help">{stepOutcomeText(s)}</span>
                {s.reason && <span className="error-text">{redact(s.reason)}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
