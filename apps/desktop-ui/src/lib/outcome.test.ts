import { describe, expect, it } from "vitest";
import { TASK_STATUSES } from "../types/contract";
import { CHARACTER_LABEL, categorizeFailure, characterStateFor, guidanceFor, RECOVERY_GUIDANCE, type CharacterState } from "./outcome";
import { replay } from "./eventReducer";
import { ev, planReady } from "../test/helpers";

const VALID: CharacterState[] = Object.keys(CHARACTER_LABEL) as CharacterState[];
const ctx = { listening: false, allVerified: true, mock: false };

describe("characterStateFor", () => {
  it("is total over every task status and returns exactly one valid state", () => {
    for (const s of TASK_STATUSES) {
      for (const allVerified of [true, false]) {
        for (const mock of [true, false]) {
          expect(VALID).toContain(characterStateFor(s, { listening: false, allVerified, mock }));
        }
      }
    }
    expect(characterStateFor(null, ctx)).toBe("idle");
  });

  it("matches the documented mapping", () => {
    expect(characterStateFor("QUEUED", ctx)).toBe("thinking");
    expect(characterStateFor("PLANNING", ctx)).toBe("thinking");
    expect(characterStateFor("RUNNING", ctx)).toBe("executing");
    expect(characterStateFor("VERIFYING", ctx)).toBe("executing");
    expect(characterStateFor("AWAITING_CONFIRMATION", ctx)).toBe("approval_required");
    expect(characterStateFor("FAILED", ctx)).toBe("error");
    expect(characterStateFor("PARTIAL", ctx)).toBe("error");
    expect(characterStateFor("CANCELLED", ctx)).toBe("cancelled");
    expect(characterStateFor(null, { ...ctx, listening: true })).toBe("listening");
  });

  it("shows success only with verification evidence, and never in mock mode", () => {
    expect(characterStateFor("SUCCEEDED", ctx)).toBe("success");
    expect(characterStateFor("SUCCEEDED", { ...ctx, allVerified: false })).toBe("idle");
    expect(characterStateFor("SUCCEEDED", { ...ctx, mock: true })).toBe("idle");
  });

  it("maps an unrecognized status to error", () => {
    expect(characterStateFor("EXPLODED", ctx)).toBe("error");
  });
});

describe("recovery guidance", () => {
  it("has at least one action for every category", () => {
    for (const list of Object.values(RECOVERY_GUIDANCE)) expect(list.length).toBeGreaterThan(0);
  });
  it("falls back to generic guidance", () => {
    expect(guidanceFor(null).length).toBeGreaterThan(0);
  });
  it("categorizes backend failures", () => {
    const step = { stepId: 1, actionType: "app.open" };
    const v = replay("t1", "x", [planReady(), ev("step_started", step), ev("verification_failed", { ...step, reason: "no window" }), ev("task_failed", { status: "FAILED" })]);
    expect(categorizeFailure(v)).toBe("verification_failed");
    const t = replay("t1", "x", [planReady(), ev("task_failed", { status: "FAILED", reason: "timed out waiting" })]);
    expect(categorizeFailure(t)).toBe("timeout");
    const c = replay("t1", "x", [planReady(), ev("task_cancelled", { status: "CANCELLED" })]);
    expect(categorizeFailure(c)).toBe("cancelled");
    const u = replay("t1", "x", [planReady(), ev("task_failed", { status: "FAILED", reason: "weird" })]);
    expect(categorizeFailure(u)).toBeNull();
  });
});
