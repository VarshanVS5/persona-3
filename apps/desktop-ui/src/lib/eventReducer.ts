// Event_Reducer (Req 10). Pure and deterministic. Step state comes ONLY from Backend events and polled status.
import type { AtlasEvent, RiskTier, TaskPlan, TaskStatus } from "../types/contract";
import { highestRisk } from "../types/contract";
import { validateEvent, validatePlan } from "./validation";

export type StepState = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface StepView {
  stepId: number;
  actionType: string;
  state: StepState;
  /** A step_started event was applied (used for "attempted - not yet verified"). */
  started: boolean;
  /** A verification_passed event was applied (the only evidence of "verified"). */
  verified: boolean;
  reason?: string;
}

export interface TerminalInfo {
  type: "task_completed" | "task_failed" | "task_cancelled";
  status: TaskStatus;
  reason?: string;
  failedStepId?: number;
}

export interface Clarification {
  question: string;
  options: string[];
}

export interface ProviderErrorInfo {
  provider: string;
  code: string;
  message: string;
  retryable: boolean;
}

export interface JournalEntry {
  timestamp: string;
  taskId: string;
  type: string;
  stepId?: number;
  detail: string;
}

export interface TaskState {
  taskId: string | null;
  request: string;
  status: TaskStatus | null;
  plan: TaskPlan | null;
  planDigest: string | null;
  /** True when a different plan digest replaced a reviewed one: approval stays disabled until acknowledged. */
  planChanged: boolean;
  planRejectedReason: string | null;
  confirmation: { planDigest: string; highestRiskTier: RiskTier } | null;
  clarification: Clarification | null;
  steps: StepView[];
  terminal: TerminalInfo | null;
  partialTranscript: string;
  finalTranscript: { id: number; text: string } | null;
  providerError: ProviderErrorInfo | null;
  /** True if any payload explicitly reported a verified compensation capability (never inferred). */
  compensationVerified: boolean;
  seen: string[];
  journal: JournalEntry[];
  diagnostics: string[];
  lastUpdateAt: number;
}

export const MAX_DIAGNOSTICS = 100;
const REASON_LIMIT = 500;

export function initialTaskState(): TaskState {
  return {
    taskId: null,
    request: "",
    status: null,
    plan: null,
    planDigest: null,
    planChanged: false,
    planRejectedReason: null,
    confirmation: null,
    clarification: null,
    steps: [],
    terminal: null,
    partialTranscript: "",
    finalTranscript: null,
    providerError: null,
    compensationVerified: false,
    seen: [],
    journal: [],
    diagnostics: [],
    lastUpdateAt: 0,
  };
}

export type TaskAction =
  | { kind: "reset" }
  | { kind: "start"; taskId: string; request: string; status: TaskStatus; now: number }
  | { kind: "event"; event: unknown; now: number }
  | { kind: "status"; status: TaskStatus; now: number }
  | { kind: "acknowledgePlan" }
  | { kind: "diagnostic"; text: string };

function addDiagnostic(state: TaskState, text: string): TaskState {
  const diagnostics = [...state.diagnostics, text].slice(-MAX_DIAGNOSTICS);
  return { ...state, diagnostics };
}

function eventKey(e: AtlasEvent): string {
  return `${e.taskId}|${e.type}|${e.timestamp}|${JSON.stringify(e.payload)}`;
}

function buildSteps(plan: TaskPlan): StepView[] {
  return plan.steps.map((s) => ({
    stepId: s.stepId,
    actionType: s.actionType,
    state: "pending",
    started: false,
    verified: false,
  }));
}

function mapStep(steps: StepView[], stepId: number, fn: (s: StepView) => StepView): StepView[] {
  return steps.map((s) => (s.stepId === stepId ? fn(s) : s));
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function stepIdOf(p: Record<string, unknown>): number | undefined {
  return typeof p.stepId === "number" ? p.stepId : undefined;
}

function statusOf(p: Record<string, unknown>): TaskStatus | null {
  const s = p.status;
  return typeof s === "string" ? (s as TaskStatus) : null;
}

function withEntry(state: TaskState, e: AtlasEvent, detail: string): TaskState {
  const entry: JournalEntry = {
    timestamp: e.timestamp,
    taskId: e.taskId,
    type: e.type,
    detail,
    ...(stepIdOf(e.payload) !== undefined ? { stepId: stepIdOf(e.payload) as number } : {}),
  };
  return { ...state, journal: [...state.journal, entry] };
}

function applyEvent(state: TaskState, e: AtlasEvent, now: number): TaskState {
  const p = e.payload;
  let next: TaskState = { ...state, lastUpdateAt: now };
  switch (e.type) {
    case "transcript": {
      const text = str(p.text);
      if (p.isFinal === true) {
        next = { ...next, partialTranscript: "", finalTranscript: { id: (state.finalTranscript?.id ?? 0) + 1, text } };
      } else {
        next = { ...next, partialTranscript: text };
      }
      return withEntry(next, e, `${str(p.source)} transcript${p.isFinal === true ? " (final)" : " (partial)"}`);
    }
    case "plan_ready": {
      const planCheck = validatePlan(p.plan);
      const digest = str(p.planDigest);
      if (!planCheck.ok || digest === "") {
        // Req 8.5: reject, drop the plan and any approval for the task.
        const reason = planCheck.ok ? "missing planDigest" : planCheck.reason;
        return withEntry(
          {
            ...next,
            plan: null,
            planDigest: null,
            confirmation: null,
            steps: [],
            planChanged: false,
            planRejectedReason: reason,
          },
          e,
          "plan rejected: could not be validated",
        );
      }
      const changed = state.planDigest !== null && state.planDigest !== digest;
      const sameDigest = state.planDigest === digest;
      next = {
        ...next,
        plan: planCheck.value,
        planDigest: digest,
        planRejectedReason: null,
        planChanged: changed ? true : state.planChanged && sameDigest,
        confirmation: changed ? null : state.confirmation,
        steps: sameDigest && state.steps.length > 0 ? state.steps : buildSteps(planCheck.value),
        clarification: null,
        status: planCheck.value.requiresConfirmation ? "AWAITING_CONFIRMATION" : (state.status ?? "PLANNING"),
      };
      return withEntry(next, e, changed ? "plan changed (new digest)" : "plan ready");
    }
    case "clarification_required": {
      const options = Array.isArray(p.options) ? p.options.filter((o): o is string => typeof o === "string") : [];
      return withEntry({ ...next, clarification: { question: str(p.question), options } }, e, "clarification requested");
    }
    case "confirmation_required": {
      const digest = str(p.planDigest);
      const tier = str(p.highestRiskTier) as RiskTier;
      // Only accept a confirmation that refers to the plan we are displaying.
      if (state.planDigest !== null && digest !== state.planDigest) {
        return addDiagnostic(withEntry(next, e, "confirmation ignored: digest does not match displayed plan"), `confirmation_required digest mismatch for ${e.taskId}`);
      }
      return withEntry({ ...next, confirmation: { planDigest: digest, highestRiskTier: tier }, status: "AWAITING_CONFIRMATION" }, e, `confirmation required (${tier})`);
    }
    case "step_started": {
      const id = stepIdOf(p);
      const step = state.steps.find((s) => s.stepId === id);
      if (id === undefined || !step || step.state !== "pending") {
        return addDiagnostic(withEntry(next, e, "step_started ignored"), `step_started ignored for step ${String(id)}`);
      }
      return withEntry(
        { ...next, steps: mapStep(state.steps, id, (s) => ({ ...s, state: "running", started: true })), status: "RUNNING", confirmation: null },
        e,
        `step ${id} started (${str(p.actionType)})`,
      );
    }
    case "verification_passed": {
      const id = stepIdOf(p);
      const step = state.steps.find((s) => s.stepId === id);
      if (id === undefined || !step || step.state !== "running") {
        return addDiagnostic(withEntry(next, e, "verification_passed ignored"), `verification_passed ignored for step ${String(id)}`);
      }
      const compensation = p.compensationVerified === true || state.compensationVerified;
      return withEntry(
        {
          ...next,
          steps: mapStep(state.steps, id, (s) => ({ ...s, state: "completed", verified: true })),
          status: "VERIFYING",
          compensationVerified: compensation,
        },
        e,
        `step ${id} verified`,
      );
    }
    case "verification_failed": {
      const id = stepIdOf(p);
      const step = state.steps.find((s) => s.stepId === id);
      const reason = str(p.reason).slice(0, REASON_LIMIT);
      if (id === undefined || !step || step.state !== "running") {
        return addDiagnostic(withEntry(next, e, "verification_failed ignored"), `verification_failed ignored for step ${String(id)}`);
      }
      return withEntry(
        { ...next, steps: mapStep(state.steps, id, (s) => ({ ...s, state: "failed", reason })) },
        e,
        `step ${id} verification failed: ${reason}`,
      );
    }
    case "task_completed":
    case "task_failed":
    case "task_cancelled": {
      const fallback: TaskStatus = e.type === "task_completed" ? "SUCCEEDED" : e.type === "task_failed" ? "FAILED" : "CANCELLED";
      const status = statusOf(p) ?? fallback;
      const reason = str(p.reason).slice(0, REASON_LIMIT);
      const terminal: TerminalInfo = {
        type: e.type,
        status,
        ...(reason ? { reason } : {}),
        ...(typeof p.failedStepId === "number" ? { failedStepId: p.failedStepId } : {}),
      };
      let steps = state.steps;
      if (e.type === "task_cancelled") {
        steps = steps.map((s) => (s.state === "pending" || s.state === "running" ? { ...s, state: "cancelled" } : s));
      }
      return withEntry({ ...next, terminal, status, steps, confirmation: null }, e, `${e.type} (${status})${reason ? `: ${reason}` : ""}`);
    }
    case "provider_error": {
      const info: ProviderErrorInfo = {
        provider: str(p.provider),
        code: str(p.code),
        message: str(p.message),
        retryable: p.retryable === true,
      };
      return withEntry({ ...next, providerError: info }, e, `provider_error ${info.provider} ${info.code}`);
    }
    default:
      return addDiagnostic(next, `unknown event type ${String(e.type)}`);
  }
}

export function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.kind) {
    case "reset":
      return initialTaskState();
    case "start":
      return {
        ...initialTaskState(),
        taskId: action.taskId,
        request: action.request,
        status: action.status,
        lastUpdateAt: action.now,
      };
    case "diagnostic":
      return addDiagnostic(state, action.text);
    case "acknowledgePlan":
      return { ...state, planChanged: false };
    case "status": {
      // Polled status never overrides a terminal state we already derived from events.
      if (state.terminal) return state;
      return { ...state, status: action.status, lastUpdateAt: action.now };
    }
    case "event": {
      const checked = validateEvent(action.event);
      if (!checked.ok) {
        const raw = action.event as { type?: unknown; taskId?: unknown } | null | undefined;
        const base = addDiagnostic(state, `event rejected: ${checked.reason}`);
        // Req 8.5: an unvalidatable plan_ready for this task removes any displayed plan and approval.
        if (raw && typeof raw === "object" && raw.type === "plan_ready" && state.taskId !== null && raw.taskId === state.taskId) {
          return { ...base, plan: null, planDigest: null, confirmation: null, steps: [], planChanged: false, planRejectedReason: checked.reason };
        }
        return base;
      }
      const e = checked.value;
      if (e.schemaVersion !== "1.0") return addDiagnostic(state, `event rejected: schemaVersion ${String(e.schemaVersion)}`);
      if (state.taskId !== null && e.taskId !== state.taskId) return state; // other task: not part of this view
      if (state.taskId === null) return addDiagnostic(state, "event ignored: no active task");
      const key = eventKey(e);
      if (state.seen.includes(key)) return state; // idempotence under duplicates / reconciliation
      return applyEvent({ ...state, seen: [...state.seen, key] }, e, action.now);
    }
    default:
      return state;
  }
}

/** Applies a sequence of events from the initial state; used by tests and snapshot reconciliation. */
export function replay(taskId: string, request: string, events: unknown[], now = 0): TaskState {
  let s = taskReducer(initialTaskState(), { kind: "start", taskId, request, status: "PLANNING", now });
  for (const ev of events) s = taskReducer(s, { kind: "event", event: ev, now });
  return s;
}

export function planHighestRisk(state: TaskState): RiskTier | null {
  if (state.confirmation) return state.confirmation.highestRiskTier;
  return state.plan ? highestRisk(state.plan) : null;
}

export function completedFraction(state: TaskState): { done: number; total: number } {
  return { done: state.steps.filter((s) => s.state === "completed").length, total: state.steps.length };
}
