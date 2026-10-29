import type { AtlasEvent, EventType, TaskPlan, TaskSnapshot, TaskStatus } from "../types/contract";
import type { AtlasClientApi, StreamHandlers } from "../services/client";
import type { SettingsStorage } from "../lib/settings";

let tick = 0;
export function ev(type: EventType, payload: Record<string, unknown>, taskId = "t1", timestamp?: string): AtlasEvent {
  tick += 1;
  return { schemaVersion: "1.0", taskId, timestamp: timestamp ?? `2025-01-01T10:00:${String(tick % 60).padStart(2, "0")}Z`, type, payload };
}

export function makePlan(overrides: Partial<TaskPlan> = {}, tier: "T0" | "T1" | "T2" | "T3" = "T1", taskId = "t1"): TaskPlan {
  return {
    taskId,
    userRequest: "Open my editor",
    summary: "Open the allowlisted editor application.",
    requiresConfirmation: true,
    steps: [
      {
        stepId: 1,
        actionType: "app.open",
        arguments: { appId: "notepad" },
        riskTier: tier,
        preconditions: [{ type: "app.allowlisted", args: { appId: "notepad" } }],
        postconditions: [{ type: "window.exists", args: { appId: "notepad" } }],
        timeoutMs: 10000,
        idempotencyKey: `${taskId}-step-1`,
      },
    ],
    ...overrides,
  };
}

export function planReady(plan = makePlan(), digest = "sha256:d1"): AtlasEvent {
  return ev("plan_ready", { plan, planDigest: digest }, plan.taskId);
}

export function memoryStorage(initial: string | null = null): SettingsStorage & { data: string | null; failWrites: boolean } {
  const s = {
    kind: "browser-local-storage" as const,
    data: initial,
    failWrites: false,
    async read() {
      return s.data;
    },
    async write(c: string) {
      if (s.failWrites) throw new Error("disk full");
      s.data = c;
    },
  };
  return s;
}

/** Scripted live-kind client for UI tests. */
export class StubClient implements AtlasClientApi {
  readonly kind = "live" as const;
  handlers: StreamHandlers | null = null;
  status: TaskStatus = "PLANNING";
  events: AtlasEvent[] = [];
  calls: string[] = [];
  planImpl: (r: string) => Promise<{ taskId: string; status: TaskStatus }> = async () => ({ taskId: "t1", status: "PLANNING" });
  confirmImpl: (id: string, d: string) => Promise<void> = async () => undefined;
  cancelImpl: (id: string) => Promise<void> = async () => undefined;
  healthImpl: () => Promise<{ status: "ok"; mockMode: boolean }> = async () => ({ status: "ok", mockMode: false });
  getTaskImpl: (id: string) => Promise<TaskSnapshot> = async (id) => ({ taskId: id, status: this.status, events: [...this.events] });

  async plan(r: string) {
    this.calls.push("plan");
    return this.planImpl(r);
  }
  async confirm(id: string, d: string) {
    this.calls.push(`confirm:${d}`);
    return this.confirmImpl(id, d);
  }
  async cancel(id: string) {
    this.calls.push("cancel");
    return this.cancelImpl(id);
  }
  async getTask(id: string) {
    this.calls.push("getTask");
    return this.getTaskImpl(id);
  }
  async health() {
    return this.healthImpl();
  }
  subscribeEvents(_id: string, h: StreamHandlers) {
    this.handlers = h;
    h.onStatus("connected");
    return () => {
      this.handlers = null;
    };
  }
  push(e: AtlasEvent) {
    this.events.push(e);
    this.handlers?.onEvent(e);
  }
}

export const MOCK_SETTINGS_JSON = JSON.stringify({ version: 1, firstLaunchComplete: true, mode: "mock", host: "127.0.0.1", port: 8765, inactivityTimeoutSec: 30, reducedMotionOverride: false, confirmBeforeClose: true });
export const LIVE_SETTINGS_JSON = JSON.stringify({ version: 1, firstLaunchComplete: true, mode: "live", host: "127.0.0.1", port: 8765, inactivityTimeoutSec: 30, reducedMotionOverride: false, confirmBeforeClose: true });
