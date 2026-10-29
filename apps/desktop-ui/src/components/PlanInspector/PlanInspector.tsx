// Plan_Inspector (Req 8). Read-only. All content is rendered as text (React escapes it) after redaction.
import { useState } from "react";
import { redact, redactJson } from "../../lib/redactor";
import type { TaskState } from "../../lib/eventReducer";
import { highestRisk } from "../../types/contract";
import type { AtlasController } from "../../hooks/useAtlas";

export interface PlanInspectorProps {
  state: TaskState;
  modeLabel: string | null;
  approvalVisible: boolean;
  onReopenApproval: () => void;
  onAcknowledge: () => void;
  onAnswerClarification: (answer: string) => void;
  confirm: AtlasController["confirm"];
  onRecheck: () => void;
}

function Clarification({ question, options, onAnswer }: { question: string; options: string[]; onAnswer: (a: string) => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const submit = (answer: string) => {
    const a = answer.trim();
    if (a.length < 1 || a.length > 500) {
      setErr("An answer of 1 to 500 characters is required.");
      return;
    }
    setErr(null);
    onAnswer(a);
  };
  return (
    <div className="clarify" role="group" aria-labelledby="clarify-q">
      <p id="clarify-q">
        <strong>ATLAS needs more information:</strong> {redact(question)}
      </p>
      {options.length > 0 && (
        <div className="button-row">
          {options.map((o) => (
            <button key={o} type="button" onClick={() => submit(o)}>
              {redact(o)}
            </button>
          ))}
        </div>
      )}
      <label htmlFor="clarify-answer">Your answer</label>
      <input id="clarify-answer" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      <button type="button" onClick={() => submit(text)}>
        Send answer as a new request
      </button>
      {err && (
        <p role="alert" className="error-text">
          {err}
        </p>
      )}
    </div>
  );
}

export function PlanInspector(p: PlanInspectorProps) {
  const { state } = p;
  const plan = state.plan;
  return (
    <section aria-labelledby="plan-h" className="panel">
      <h2 id="plan-h">Plan</h2>
      {p.modeLabel && <p className="mode-label">{p.modeLabel}</p>}
      {state.planRejectedReason && (
        <p role="alert" className="error-text">
          Plan could not be validated. No approval is available for this task.
        </p>
      )}
      {state.planChanged && (
        <div role="alert" className="warn-box">
          <p>
            <strong>Plan changed - review again.</strong> Approval is disabled until you have reviewed the updated plan below.
          </p>
          <button type="button" onClick={p.onAcknowledge}>
            I have reviewed the updated plan
          </button>
        </div>
      )}
      {state.clarification && <Clarification question={state.clarification.question} options={state.clarification.options} onAnswer={p.onAnswerClarification} />}
      {!plan && !state.clarification && !state.planRejectedReason && <p className="empty">{state.taskId ? "Waiting for the plan..." : "No plan yet."}</p>}
      {plan && (
        <>
          <p>{redact(plan.summary)}</p>
          <p>
            <strong>Highest risk:</strong> {highestRisk(plan)} - <strong>Confirmation:</strong> {plan.requiresConfirmation ? "required" : "not required"}
          </p>
          {state.confirmation?.highestRiskTier === "T3" && (
            <p role="alert" className="error-text">
              Blocked or requires separate authorization (T3). This plan cannot be approved from this window.
            </p>
          )}
          <ol className="plan-steps">
            {plan.steps.map((s) => (
              <li key={s.stepId}>
                <div className="step-head">
                  <strong>
                    {s.stepId}. {redact(s.actionType)}
                  </strong>
                  <span className={`pill pill-${s.riskTier}`}>{s.riskTier}</span>
                  <span className="help">timeout {s.timeoutMs} ms</span>
                </div>
                <dl>
                  <dt>Arguments</dt>
                  <dd>
                    <pre>{redactJson(s.arguments)}</pre>
                  </dd>
                  <dt>Preconditions</dt>
                  <dd>{s.preconditions.length === 0 ? "None" : s.preconditions.map((c) => redact(c.type)).join(", ")}</dd>
                  <dt>Postconditions</dt>
                  <dd>{s.postconditions.length === 0 ? "None" : s.postconditions.map((c) => redact(c.type)).join(", ")}</dd>
                </dl>
              </li>
            ))}
          </ol>
          {state.confirmation && state.confirmation.highestRiskTier !== "T3" && !p.approvalVisible && !state.planChanged && state.status === "AWAITING_CONFIRMATION" && (
            <button type="button" className="primary" onClick={p.onReopenApproval}>
              Review and approve
            </button>
          )}
          {p.confirm.message && !p.approvalVisible && (
            <p role="alert" className="error-text">
              {p.confirm.message}
            </p>
          )}
          {p.confirm.phase === "unknown" && (
            <button type="button" onClick={p.onRecheck}>
              Re-check task state
            </button>
          )}
        </>
      )}
    </section>
  );
}
