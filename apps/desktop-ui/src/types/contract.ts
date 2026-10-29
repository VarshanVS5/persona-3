// Types mirroring packages/contracts (events.schema.json v1.0, task-plan.schema.json).
// The schemas remain the source of truth; payloads are validated with them at runtime (lib/validation.ts).

export type RiskTier = "T0" | "T1" | "T2" | "T3";

export type TaskStatus =
  | "QUEUED"
  | "PLANNING"
  | "AWAITING_CONFIRMATION"
  | "RUNNING"
  | "VERIFYING"
  | "CANCELLING"
  | "SUCCEEDED"
  | "FAILED"
  | "PARTIAL"
  | "CANCELLED";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "QUEUED",
  "PLANNING",
  "AWAITING_CONFIRMATION",
  "RUNNING",
  "VERIFYING",
  "CANCELLING",
  "SUCCEEDED",
  "FAILED",
  "PARTIAL",
  "CANCELLED",
];

export const TERMINAL_STATUSES: readonly TaskStatus[] = ["SUCCEEDED", "FAILED", "PARTIAL", "CANCELLED"];

export function isTerminal(status: TaskStatus | null): boolean {
  return status !== null && TERMINAL_STATUSES.includes(status);
}

export interface Condition {
  type: string;
  args: Record<string, unknown>;
}

export interface ActionStep {
  stepId: number;
  actionType: string;
  arguments: Record<string, unknown>;
  riskTier: RiskTier;
  preconditions: Condition[];
  postconditions: Condition[];
  timeoutMs: number;
  idempotencyKey: string;
}

export interface TaskPlan {
  taskId: string;
  userRequest: string;
  summary: string;
  requiresConfirmation: boolean;
  steps: ActionStep[];
}

export type EventType =
  | "transcript"
  | "plan_ready"
  | "clarification_required"
  | "confirmation_required"
  | "step_started"
  | "verification_passed"
  | "verification_failed"
  | "task_completed"
  | "task_failed"
  | "task_cancelled"
  | "provider_error";

export interface AtlasEvent {
  schemaVersion: "1.0";
  taskId: string;
  timestamp: string;
  type: EventType;
  payload: Record<string, unknown>;
}

export interface TaskSnapshot {
  taskId: string;
  status: TaskStatus;
  plan?: TaskPlan;
  events: AtlasEvent[];
}

export interface PlanAccepted {
  taskId: string;
  status: TaskStatus;
}

export interface Health {
  status: "ok";
  mockMode: boolean;
}

export const RISK_ORDER: Record<RiskTier, number> = { T0: 0, T1: 1, T2: 2, T3: 3 };

export function highestRisk(plan: TaskPlan): RiskTier {
  let best: RiskTier = "T0";
  for (const s of plan.steps) {
    if (RISK_ORDER[s.riskTier] > RISK_ORDER[best]) best = s.riskTier;
  }
  return best;
}
