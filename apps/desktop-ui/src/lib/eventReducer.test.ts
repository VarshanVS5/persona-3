import { describe, expect, it } from "vitest";
import { initialTaskState, replay, taskReducer } from "./eventReducer";
import { allStepsVerified, deriveOutcome } from "./outcome";
import { ev, makePlan, planReady } from "../test/helpers";

const step = { stepId: 1, actionType: "app.open" };

function happy() {
  return [
    planReady(),
    ev("confirmation_required", { planDigest: "sha256:d1", highestRiskTier: "T1" }),
    ev("step_started", step),
    ev("verification_passed", step),
    ev("task_completed", { status: "SUCCEEDED" }),
  ];
}

describe("Event_Reducer", () => {
  it("starts with every step pending, then follows Backend events only", () => {
    let s = replay("t1", "Open my editor", [planReady()]);
    expect(s.steps.map((x) => x.state)).toEqual(["pending"]);
    s = replay("t1", "x", [planReady(), ev("step_started", step)]);
    expect(s.steps[0]?.state).toBe("running");
    s = replay("t1", "x", [planReady(), ev("step_started", step), ev("verification_passed", step)]);
    expect(s.steps[0]?.state).toBe("completed");
  });

  it("marks verification_failed with a truncated reason", () => {
    const reason = "r".repeat(900);
    const s = replay("t1", "x", [planReady(), ev("step_started", step), ev("verification_failed", { ...step, reason })]);
    expect(s.steps[0]?.state).toBe("failed");
    expect(s.steps[0]?.reason?.length).toBe(500);
  });

  it("cancels pending and running steps but leaves completed ones", () => {
    const plan = makePlan({ steps: [makePlan().steps[0]!, { ...makePlan().steps[0]!, stepId: 2 }, { ...makePlan().steps[0]!, stepId: 3 }] });
    const s = replay("t1", "x", [
      planReady(plan),
      ev("step_started", step),
      ev("verification_passed", step),
      ev("step_started", { stepId: 2, actionType: "app.open" }),
      ev("task_cancelled", { status: "CANCELLED" }),
    ]);
    expect(s.steps.map((x) => x.state)).toEqual(["completed", "cancelled", "cancelled"]);
  });

  it("is deterministic", () => {
    const events = happy();
    expect(replay("t1", "x", events)).toEqual(replay("t1", "x", events));
  });

  it("is idempotent under duplicate events", () => {
    const events = happy();
    const dup = events.flatMap((e) => [e, e]);
    const a = replay("t1", "x", events);
    const b = replay("t1", "x", dup);
    expect(b.steps).toEqual(a.steps);
    expect(b.terminal).toEqual(a.terminal);
    expect(b.status).toBe(a.status);
    expect(b.journal.length).toBe(a.journal.length);
  });

  it("ignores events with an unknown type or schemaVersion and records diagnostics", () => {
    const bad1 = { ...ev("step_started", step), type: "launch_missiles" };
    const bad2 = { ...ev("step_started", step), schemaVersion: "2.0" };
    const s = replay("t1", "x", [planReady(), bad1, bad2, null]);
    expect(s.steps[0]?.state).toBe("pending");
    expect(s.diagnostics.length).toBe(3);
  });

  it("ignores events for another task", () => {
    const s = replay("t1", "x", [planReady(), ev("step_started", step, "other")]);
    expect(s.steps[0]?.state).toBe("pending");
    expect(s.journal.every((j) => j.taskId === "t1")).toBe(true);
  });

  it("ignores out-of-order verification (no step_started)", () => {
    const s = replay("t1", "x", [planReady(), ev("verification_passed", step)]);
    expect(s.steps[0]?.verified).toBe(false);
    expect(s.diagnostics.length).toBe(1);
  });

  it("keeps at most 100 diagnostics", () => {
    let s = replay("t1", "x", []);
    for (let i = 0; i < 150; i++) s = taskReducer(s, { kind: "diagnostic", text: `d${i}` });
    expect(s.diagnostics.length).toBe(100);
    expect(s.diagnostics.at(-1)).toBe("d149");
  });

  describe("plan handling", () => {
    it("rejects an invalid plan payload and exposes no confirmation", () => {
      const bad = ev("plan_ready", { plan: { taskId: "t1" }, planDigest: "d" });
      const s = replay("t1", "x", [bad]);
      expect(s.plan).toBeNull();
      expect(s.planRejectedReason).not.toBeNull();
      expect(s.confirmation).toBeNull();
    });

    it("drops a bad replacement plan and any pending approval", () => {
      const s = replay("t1", "x", [planReady(), ev("confirmation_required", { planDigest: "sha256:d1", highestRiskTier: "T1" }), ev("plan_ready", { plan: { nope: 1 }, planDigest: "d2" })]);
      expect(s.plan).toBeNull();
      expect(s.confirmation).toBeNull();
    });

    it("a different digest discards the approval and flags 'plan changed'", () => {
      const s = replay("t1", "x", [
        planReady(makePlan(), "sha256:d1"),
        ev("confirmation_required", { planDigest: "sha256:d1", highestRiskTier: "T1" }),
        planReady(makePlan({ summary: "A different plan" }), "sha256:d2"),
      ]);
      expect(s.planChanged).toBe(true);
      expect(s.confirmation).toBeNull();
      expect(s.planDigest).toBe("sha256:d2");
      expect(taskReducer(s, { kind: "acknowledgePlan" }).planChanged).toBe(false);
    });

    it("ignores a confirmation whose digest does not match the displayed plan", () => {
      const s = replay("t1", "x", [planReady(makePlan(), "sha256:d1"), ev("confirmation_required", { planDigest: "sha256:other", highestRiskTier: "T1" })]);
      expect(s.confirmation).toBeNull();
    });
  });

  describe("outcome derivation (no success without evidence)", () => {
    it("verified only when every step has verification_passed", () => {
      const s = replay("t1", "x", happy());
      expect(allStepsVerified(s)).toBe(true);
      expect(deriveOutcome(s)).toMatchObject({ label: "verified", evidence: true });
    });

    it("SUCCEEDED without verification is NOT verified", () => {
      const s = replay("t1", "x", [planReady(), ev("task_completed", { status: "SUCCEEDED" })]);
      const o = deriveOutcome(s);
      expect(o?.label).not.toBe("verified");
      expect(o?.note).toMatch(/verification evidence missing/);
      expect(o?.evidence).toBe(false);
    });

    it("started but unverified is 'attempted'", () => {
      const s = replay("t1", "x", [planReady(), ev("step_started", step)]);
      expect(deriveOutcome(s)).toMatchObject({ label: "attempted", note: "not yet verified" });
    });

    it("distinguishes failed, partial and cancelled", () => {
      expect(deriveOutcome(replay("t1", "x", [planReady(), ev("task_failed", { status: "FAILED", reason: "boom" })]))?.label).toBe("failed");
      expect(deriveOutcome(replay("t1", "x", [planReady(), ev("task_failed", { status: "PARTIAL" })]))).toMatchObject({ label: "failed", note: "partial" });
      expect(deriveOutcome(replay("t1", "x", [planReady(), ev("task_cancelled", { status: "CANCELLED" })]))?.label).toBe("cancelled");
    });

    it("only reports compensation when the backend says so", () => {
      expect(replay("t1", "x", happy()).compensationVerified).toBe(false);
      const s = replay("t1", "x", [planReady(), ev("step_started", step), ev("verification_passed", { ...step, compensationVerified: true })]);
      expect(s.compensationVerified).toBe(true);
    });
  });

  it("a polled status never overrides a derived terminal state", () => {
    let s = replay("t1", "x", happy());
    s = taskReducer(s, { kind: "status", status: "RUNNING", now: 1 });
    expect(s.status).toBe("SUCCEEDED");
  });

  it("starts empty", () => {
    expect(initialTaskState().taskId).toBeNull();
    expect(deriveOutcome(initialTaskState())).toBeNull();
  });
});
