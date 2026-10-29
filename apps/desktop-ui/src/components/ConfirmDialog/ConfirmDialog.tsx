// Approval_Control (Req 9). Approve is only reachable for the exact displayed Plan_Digest; T3 never offers Approve.
import { useState } from "react";
import { redact } from "../../lib/redactor";
import type { TaskPlan, RiskTier } from "../../types/contract";
import type { ConfirmState } from "../../hooks/useAtlas";
import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  plan: TaskPlan;
  planDigest: string;
  tier: RiskTier;
  confirm: ConfirmState;
  /** Label required by Req 5: "MOCK - nothing was executed" / "SIMULATED by backend" / null for live. */
  modeLabel: string | null;
  onApprove: () => void;
  onReject: () => void;
  onDismiss: () => void;
  onRecheck: () => void;
  focusComposer: () => HTMLElement | null;
}

export function affectedTargets(plan: TaskPlan): string[] {
  const out: string[] = [];
  for (const s of plan.steps) {
    const vals = Object.entries(s.arguments).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
    out.push(`Step ${s.stepId} ${s.actionType}${vals.length ? ` (${vals.join(", ")})` : ""}`);
  }
  return out;
}

export function ConfirmDialog(p: ConfirmDialogProps) {
  const [secondStep, setSecondStep] = useState(false);
  const targets = affectedTargets(p.plan).map(redact);
  const busy = p.confirm.phase === "inflight";
  const unknown = p.confirm.phase === "unknown";
  const needsSecond = p.tier === "T2";

  return (
    <Dialog titleId="approval-title" title="Approve this plan?" onDismiss={p.onDismiss} returnFocus={p.focusComposer}>
      {p.modeLabel && <p className="mode-label">{p.modeLabel}</p>}
      <p>{redact(p.plan.summary)}</p>
      <p>
        <strong>Highest risk:</strong> {p.tier}
      </p>
      <p>
        <strong>Affected targets:</strong>
      </p>
      <ul>
        {targets.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      {p.confirm.message && (
        <p role="alert" className="error-text">
          {p.confirm.message}
        </p>
      )}
      {needsSecond && !secondStep && (
        <p className="warn-text">This plan is high risk (T2). A second confirmation naming the targets above is required.</p>
      )}
      {needsSecond && secondStep && (
        <p role="alert" className="warn-text">
          Confirm again: you approve changes to {targets.join("; ")}.
        </p>
      )}
      <div className="button-row">
        {unknown ? (
          <button type="button" onClick={p.onRecheck}>
            Re-check task state
          </button>
        ) : needsSecond && !secondStep ? (
          <button type="button" className="primary" onClick={() => setSecondStep(true)}>
            Continue to second confirmation
          </button>
        ) : (
          <button type="button" className="primary" disabled={busy} onClick={p.onApprove}>
            {busy ? "Sending approval..." : needsSecond ? "Confirm and approve" : "Approve"}
          </button>
        )}
        <button type="button" className="danger" disabled={busy} onClick={p.onReject}>
          Reject
        </button>
        <button type="button" onClick={p.onDismiss}>
          Close (do not approve)
        </button>
      </div>
    </Dialog>
  );
}
