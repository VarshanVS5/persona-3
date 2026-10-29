// MOCK CLIENT - serves fixtures from packages/contracts/examples. Nothing is executed on this machine.
// Used only when the user explicitly selects Mock mode; never a fallback for an unreachable backend.
import planReadyFixture from "../../../../packages/contracts/examples/event.plan_ready.json";
import completedFixture from "../../../../packages/contracts/examples/event.task_completed.json";
import failedFixture from "../../../../packages/contracts/examples/event.task_failed.json";
import quickPlanFixture from "../../../../packages/contracts/examples/plan.valid.json";
import blockedPlanFixture from "../../../../packages/contracts/examples/plan.invalid-unknown-action.json";
import type { AtlasEvent, Health, PlanAccepted, TaskPlan, TaskSnapshot, TaskStatus } from "../types/contract";
import { highestRisk, isTerminal } from "../types/contract";
import { ClientError, type AtlasClientApi, type StreamHandlers } from "./client";

type Scenario = "success" | "failure" | "blocked" | "quick";

interface MockTask {
  taskId: string;
  scenario: Scenario;
  plan: TaskPlan;
  digest: string;
  status: TaskStatus;
  events: AtlasEvent[];
  timers: ReturnType<typeof setTimeout>[];
  subscribers: Set<StreamHandlers>;
}

export interface MockClientOptions {
  /** Delay between emitted events. Defaults to 600 ms (Req 18.9: 200-1000 ms). Tests may use 0. */
  delayMs?: number;
}

function pickScenario(request: string): Scenario {
  const r = request.toLowerCase();
  if (/(shell|command|terminal|delete)/.test(r)) return "blocked";
  if (/(fail|error)/.test(r)) return "failure";
  if (/(quick|no confirm)/.test(r)) return "quick";
  return "success";
}

export class MockClient implements AtlasClientApi {
  readonly kind = "mock" as const;
  private readonly delayMs: number;
  private counter = 0;
  private readonly tasks = new Map<string, MockTask>();

  constructor(opts: MockClientOptions = {}) {
    this.delayMs = opts.delayMs ?? 600;
  }

  private ev(task: MockTask, type: AtlasEvent["type"], payload: Record<string, unknown>): AtlasEvent {
    return { schemaVersion: "1.0", taskId: task.taskId, timestamp: new Date().toISOString(), type, payload };
  }

  private emit(task: MockTask, event: AtlasEvent, status?: TaskStatus): void {
    task.events.push(event);
    if (status) task.status = status;
    for (const s of task.subscribers) s.onEvent(event);
  }

  private later(task: MockTask, events: Array<() => void>): void {
    events.forEach((fn, i) => {
      const t = setTimeout(fn, this.delayMs * (i + 1));
      task.timers.push(t);
    });
  }

  async plan(userRequest: string): Promise<PlanAccepted> {
    const scenario = pickScenario(userRequest);
    this.counter += 1;
    const taskId = `mock-${String(this.counter).padStart(4, "0")}`;
    const base =
      scenario === "blocked" ? (blockedPlanFixture as TaskPlan)
      : scenario === "quick" ? (quickPlanFixture as TaskPlan)
      : ((planReadyFixture.payload.plan as unknown) as TaskPlan);
    const plan: TaskPlan = {
      ...base,
      taskId,
      userRequest,
      summary: `[MOCK] ${base.summary}`,
      steps: base.steps.map((s) => ({ ...s, idempotencyKey: `${taskId}-step-${s.stepId}` })),
    };
    const digest = `${planReadyFixture.payload.planDigest}:${scenario}`;
    const task: MockTask = { taskId, scenario, plan, digest, status: "PLANNING", events: [], timers: [], subscribers: new Set() };
    this.tasks.set(taskId, task);

    const steps: Array<() => void> = [
      () => this.emit(task, this.ev(task, "plan_ready", { plan, planDigest: digest }), plan.requiresConfirmation ? "AWAITING_CONFIRMATION" : "PLANNING"),
    ];
    if (plan.requiresConfirmation) {
      steps.push(() =>
        this.emit(task, this.ev(task, "confirmation_required", { planDigest: digest, highestRiskTier: highestRisk(plan) }), "AWAITING_CONFIRMATION"),
      );
    } else {
      steps.push(...this.executionEvents(task));
    }
    this.later(task, steps);
    return { taskId, status: "PLANNING" };
  }

  private executionEvents(task: MockTask): Array<() => void> {
    const first = task.plan.steps[0];
    const stepPayload = { stepId: first?.stepId ?? 1, actionType: first?.actionType ?? "app.open" };
    const out: Array<() => void> = [() => this.emit(task, this.ev(task, "step_started", { ...stepPayload, status: "RUNNING" }), "RUNNING")];
    if (task.scenario === "failure") {
      const reason = (failedFixture.payload as { reason: string }).reason;
      out.push(() => this.emit(task, this.ev(task, "verification_failed", { ...stepPayload, reason, status: "VERIFYING" }), "VERIFYING"));
      out.push(() => this.emit(task, this.ev(task, "task_failed", { status: "FAILED", reason, failedStepId: stepPayload.stepId }), "FAILED"));
    } else {
      out.push(() => this.emit(task, this.ev(task, "verification_passed", { ...stepPayload, status: "VERIFYING" }), "VERIFYING"));
      out.push(() => this.emit(task, this.ev(task, "task_completed", { status: (completedFixture.payload as { status: string }).status }), "SUCCEEDED"));
    }
    return out;
  }

  async confirm(taskId: string, planDigest: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new ClientError("rejected", "Unknown mock task", 404);
    if (task.scenario === "blocked") throw new ClientError("rejected", "Blocked by policy (mock fixture)", 403);
    if (planDigest !== task.digest) throw new ClientError("rejected", "Plan changed since review", 409);
    if (task.status !== "AWAITING_CONFIRMATION") throw new ClientError("rejected", "Task is not awaiting confirmation", 409);
    task.status = "RUNNING";
    this.later(task, this.executionEvents(task));
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new ClientError("rejected", "Unknown mock task", 404);
    if (isTerminal(task.status)) return;
    task.timers.forEach(clearTimeout);
    task.timers = [];
    const t = setTimeout(() => this.emit(task, this.ev(task, "task_cancelled", { status: "CANCELLED", reason: "Cancelled by user" }), "CANCELLED"), this.delayMs);
    task.timers.push(t);
  }

  async getTask(taskId: string): Promise<TaskSnapshot> {
    const task = this.tasks.get(taskId);
    if (!task) throw new ClientError("rejected", "Unknown mock task", 404);
    return { taskId, status: task.status, plan: task.plan, events: [...task.events] };
  }

  async health(): Promise<Health> {
    return { status: "ok", mockMode: true };
  }

  subscribeEvents(taskId: string, handlers: StreamHandlers): () => void {
    const task = this.tasks.get(taskId);
    if (!task) {
      handlers.onStatus("closed");
      return () => undefined;
    }
    handlers.onStatus("connected");
    task.subscribers.add(handlers);
    for (const e of task.events) handlers.onEvent(e);
    return () => {
      task.subscribers.delete(handlers);
      handlers.onStatus("closed");
    };
  }

  /** Test helper: stop all pending timers. */
  dispose(): void {
    for (const t of this.tasks.values()) t.timers.forEach(clearTimeout);
  }
}
