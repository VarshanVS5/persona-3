// Outcome_State derivation, Character_State mapping, recovery guidance (Req 11, 16).
import type { TaskState } from "./eventReducer";
import type { TaskStatus } from "../types/contract";
import { isTaskStatus } from "./validation";

export type OutcomeLabel = "requested" | "attempted" | "completed" | "verified" | "failed" | "cancelled";

export interface Outcome {
  label: OutcomeLabel;
  /** Extra honest qualifier shown next to the label. */
  note?: string;
  /** True only when the label is backed by Backend verification evidence for every step. */
  evidence: boolean;
}

export function allStepsVerified(state: TaskState): boolean {
  return state.steps.length > 0 && state.steps.every((s) => s.verified);
}

export function deriveOutcome(state: TaskState): Outcome | null {
  if (state.taskId === null) return null;
  const t = state.terminal;
  if (t) {
    if (t.status === "CANCELLED") return { label: "cancelled", evidence: true };
    if (t.status === "FAILED") return { label: "failed", evidence: true };
    if (t.status === "PARTIAL") return { label: "failed", note: "partial", evidence: true };
    if (t.status === "SUCCEEDED") {
      if (allStepsVerified(state)) return { label: "verified", evidence: true };
      return { label: "completed", note: "reported complete - verification evidence missing", evidence: false };
    }
  }
  const failedStep = state.steps.find((s) => s.state === "failed");
  if (failedStep) return { label: "failed", evidence: true };
  if (state.steps.some((s) => s.started)) return { label: "attempted", note: "not yet verified", evidence: false };
  return { label: "requested", evidence: false };
}

export function stepOutcomeText(step: { started: boolean; verified: boolean; state: string }): string {
  if (step.state === "failed") return "failed";
  if (step.state === "cancelled") return "cancelled";
  if (step.verified) return "verified";
  if (step.started) return "attempted - not yet verified";
  return "requested";
}

// ---------------- Character ----------------

export type CharacterState =
  | "idle"
  | "listening"
  | "thinking"
  | "executing"
  | "approval_required"
  | "success"
  | "error"
  | "cancelled";

export interface CharacterContext {
  listening: boolean;
  allVerified: boolean;
  mock: boolean;
}

/** Total: always returns exactly one state (Req 16.6/16.7). Unknown status maps to "error". */
export function characterStateFor(status: TaskStatus | null | string, ctx: CharacterContext): CharacterState {
  if (status === null) return ctx.listening ? "listening" : "idle";
  if (!isTaskStatus(status)) return "error";
  switch (status) {
    case "QUEUED":
    case "PLANNING":
      return "thinking";
    case "RUNNING":
    case "VERIFYING":
    case "CANCELLING":
      return "executing";
    case "AWAITING_CONFIRMATION":
      return "approval_required";
    case "SUCCEEDED":
      // Never show success without evidence, and never for mock fixtures.
      return ctx.allVerified && !ctx.mock ? "success" : "idle";
    case "FAILED":
    case "PARTIAL":
      return "error";
    case "CANCELLED":
      return "cancelled";
  }
}

export const CHARACTER_LABEL: Record<CharacterState, string> = {
  idle: "Idle",
  listening: "Listening",
  thinking: "Thinking",
  executing: "Executing",
  approval_required: "Waiting for your approval",
  success: "Verified success",
  error: "Error",
  cancelled: "Cancelled",
};

// ---------------- Recovery guidance ----------------

export type FailureCategory = "unreachable" | "timeout" | "verification_failed" | "policy_blocked" | "provider_error" | "cancelled";

export const RECOVERY_GUIDANCE: Record<FailureCategory, string[]> = {
  unreachable: [
    "Check that the ATLAS backend is running on 127.0.0.1 and the port in Settings is correct.",
    "Use Retry connection, or open the About view for the backend troubleshooting steps.",
  ],
  timeout: [
    "The action did not finish in time. Check the target application manually before retrying.",
    "Submit the request again only after confirming the earlier attempt did not take effect.",
  ],
  verification_failed: [
    "The action ran but its result could not be confirmed. Check the application or file state yourself.",
    "Review the Audit journal entry for this step, then submit the request again if needed.",
  ],
  policy_blocked: [
    "The backend policy blocked this action. It cannot be approved from this window.",
    "Rephrase the request using an allowed action, or ask the project owner about the policy.",
  ],
  provider_error: [
    "A provider (9Router or speech) reported an error. Typed input and mock mode still work.",
    "Check the provider settings in the backend .env file, then retry.",
  ],
  cancelled: ["The task was cancelled. Steps that already finished are not undone.", "Submit a new request to continue."],
};

export const GENERIC_GUIDANCE = ["Retry the task, or review the Audit journal for details."];

export function categorizeFailure(state: TaskState): FailureCategory | null {
  const t = state.terminal;
  if (t?.status === "CANCELLED") return "cancelled";
  if (state.providerError && (t?.status === "FAILED" || t?.status === "PARTIAL")) return "provider_error";
  if (state.steps.some((s) => s.state === "failed")) return "verification_failed";
  const reason = (t?.reason ?? "").toLowerCase();
  if (reason.includes("timeout") || reason.includes("timed out") || reason.includes("within timeoutms")) return "timeout";
  if (reason.includes("policy") || reason.includes("blocked") || reason.includes("not allowed") || reason.includes("allowlist")) return "policy_blocked";
  if (reason.includes("postcondition") || reason.includes("verification")) return "verification_failed";
  return null;
}

export function guidanceFor(category: FailureCategory | null): string[] {
  return category ? RECOVERY_GUIDANCE[category] : GENERIC_GUIDANCE;
}
