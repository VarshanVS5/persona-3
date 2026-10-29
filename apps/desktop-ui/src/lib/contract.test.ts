import { describe, expect, it } from "vitest";
import { validateEvent, validatePlan, validateHealth, validatePlanAccepted, validateSnapshot } from "./validation";
import { MockClient } from "../services/mockClient";
import type { AtlasEvent } from "../types/contract";

const fixtures = import.meta.glob("../../../../packages/contracts/examples/*.json", { eager: true, import: "default" }) as Record<string, unknown>;

describe("shared contract fixtures", () => {
  const entries = Object.entries(fixtures);
  it("finds the fixture files", () => {
    expect(entries.length).toBeGreaterThanOrEqual(6);
  });

  for (const [path, data] of entries) {
    const name = path.split("/").pop() ?? path;
    if (name.startsWith("event.")) {
      it(`${name} conforms to events.schema.json`, () => {
        expect(validateEvent(data).ok).toBe(true);
      });
    } else if (name.startsWith("plan.")) {
      // invalid-* plans are schema-valid; rejecting them is backend policy, not a UI duty.
      it(`${name} conforms to task-plan.schema.json`, () => {
        expect(validatePlan(data).ok).toBe(true);
      });
    }
  }
});

describe("schema rejection", () => {
  it("rejects malformed events", () => {
    expect(validateEvent({}).ok).toBe(false);
    expect(validateEvent({ schemaVersion: "2.0", taskId: "t", timestamp: "2025-01-01T00:00:00Z", type: "plan_ready", payload: {} }).ok).toBe(false);
    expect(validateEvent({ schemaVersion: "1.0", taskId: "t", timestamp: "2025-01-01T00:00:00Z", type: "not_a_type", payload: {} }).ok).toBe(false);
    expect(validateEvent({ schemaVersion: "1.0", taskId: "t", timestamp: "2025-01-01T00:00:00Z", type: "step_started", payload: { stepId: "x" } }).ok).toBe(false);
  });
  it("rejects a malformed plan", () => {
    expect(validatePlan({ taskId: "t" }).ok).toBe(false);
  });
  it("rejects malformed responses", () => {
    expect(validatePlanAccepted({ taskId: "", status: "PLANNING" }).ok).toBe(false);
    expect(validatePlanAccepted({ taskId: "a", status: "BOGUS" }).ok).toBe(false);
    expect(validateHealth({ status: "ok" }).ok).toBe(false);
    expect(validateSnapshot({ taskId: "a", status: "RUNNING", events: [{ bad: true }] }).ok).toBe(false);
  });
});

describe("MockClient output conforms to the schemas", () => {
  const scenarios = ["open my editor", "please fail", "run a shell command", "quick open"];
  for (const request of scenarios) {
    it(`emits only valid events for "${request}"`, async () => {
      const client = new MockClient({ delayMs: 0 });
      const accepted = await client.plan(request);
      expect(validatePlanAccepted(accepted).ok).toBe(true);
      const seen: unknown[] = [];
      const off = client.subscribeEvents(accepted.taskId, { onEvent: (e) => seen.push(e), onStatus: () => undefined });
      await new Promise((r) => setTimeout(r, 30));
      const first = seen[0] as AtlasEvent | undefined;
      expect(first?.type).toBe("plan_ready");
      if (first?.type === "plan_ready") {
        const digest = (first.payload as { planDigest: string }).planDigest;
        await client.confirm(accepted.taskId, digest).catch(() => undefined);
        await new Promise((r) => setTimeout(r, 40));
      }
      for (const e of seen) expect(validateEvent(e).ok).toBe(true);
      const snap = await client.getTask(accepted.taskId);
      expect(validateSnapshot(snap).ok).toBe(true);
      expect(validateHealth(await client.health()).ok).toBe(true);
      off();
      client.dispose();
    });
  }
});
