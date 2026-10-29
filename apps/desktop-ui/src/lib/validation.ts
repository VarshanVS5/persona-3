import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import eventsSchema from "../../../../packages/contracts/events.schema.json";
import planSchema from "../../../../packages/contracts/task-plan.schema.json";
import type { AtlasEvent, Health, PlanAccepted, TaskPlan, TaskSnapshot, TaskStatus } from "../types/contract";
import { TASK_STATUSES } from "../types/contract";

// Validates every payload against the shared schemas before it reaches the reducer (Req 18.2).
const ajv = new Ajv2020({ strict: false, allErrors: false });
addFormats(ajv);
ajv.addSchema(planSchema);
const validateEventFn = ajv.compile(eventsSchema);
const validatePlanFn = ajv.compile(planSchema);

export type Validated<T> = { ok: true; value: T } | { ok: false; reason: string };

function why(errors: typeof validateEventFn.errors): string {
  const e = errors?.[0];
  return e ? `${e.instancePath || "/"} ${e.message ?? "invalid"}` : "invalid";
}

export function validateEvent(value: unknown): Validated<AtlasEvent> {
  if (validateEventFn(value)) return { ok: true, value: value as unknown as AtlasEvent };
  return { ok: false, reason: why(validateEventFn.errors) };
}

export function validatePlan(value: unknown): Validated<TaskPlan> {
  if (validatePlanFn(value)) return { ok: true, value: value as unknown as TaskPlan };
  return { ok: false, reason: why(validatePlanFn.errors) };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}

export function validatePlanAccepted(v: unknown): Validated<PlanAccepted> {
  if (isObject(v) && typeof v.taskId === "string" && v.taskId.length > 0 && isTaskStatus(v.status)) {
    return { ok: true, value: { taskId: v.taskId, status: v.status } };
  }
  return { ok: false, reason: "expected { taskId, status }" };
}

export function validateHealth(v: unknown): Validated<Health> {
  if (isObject(v) && v.status === "ok" && typeof v.mockMode === "boolean") {
    return { ok: true, value: { status: "ok", mockMode: v.mockMode } };
  }
  return { ok: false, reason: "expected { status: 'ok', mockMode: boolean }" };
}

export function validateSnapshot(v: unknown): Validated<TaskSnapshot> {
  if (!isObject(v) || typeof v.taskId !== "string" || !isTaskStatus(v.status) || !Array.isArray(v.events)) {
    return { ok: false, reason: "expected { taskId, status, events[] }" };
  }
  const events: AtlasEvent[] = [];
  for (const raw of v.events) {
    const r = validateEvent(raw);
    if (!r.ok) return { ok: false, reason: `event: ${r.reason}` };
    events.push(r.value);
  }
  let plan: TaskPlan | undefined;
  if (v.plan !== undefined) {
    const p = validatePlan(v.plan);
    if (!p.ok) return { ok: false, reason: `plan: ${p.reason}` };
    plan = p.value;
  }
  return { ok: true, value: { taskId: v.taskId, status: v.status, events, ...(plan ? { plan } : {}) } };
}
