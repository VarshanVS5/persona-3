import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, containsSecretPattern, parseSettings, serializeSettings, settingsEqual, validateHost, validatePort, validateTimeout, type Settings } from "./settings";

describe("settings", () => {
  it("round-trips valid settings", () => {
    const samples: Settings[] = [
      DEFAULT_SETTINGS,
      { ...DEFAULT_SETTINGS, firstLaunchComplete: true, mode: "mock" },
      { ...DEFAULT_SETTINGS, firstLaunchComplete: true, mode: "live", port: 1024, inactivityTimeoutSec: 10, reducedMotionOverride: true, confirmBeforeClose: false },
      { ...DEFAULT_SETTINGS, firstLaunchComplete: true, mode: "live", port: 65535, inactivityTimeoutSec: 120 },
    ];
    for (const s of samples) {
      const parsed = parseSettings(serializeSettings(s));
      expect(settingsEqual(parsed.settings, s)).toBe(true);
      expect(parsed.resetFields).toEqual([]);
    }
  });

  it("uses defaults when the file is missing or unreadable", () => {
    expect(parseSettings(null)).toMatchObject({ missing: true, wholeFileReset: false });
    expect(parseSettings("{not json")).toMatchObject({ wholeFileReset: true });
    expect(parseSettings("[1,2]")).toMatchObject({ wholeFileReset: true });
    expect(parseSettings("{not json").settings).toEqual(DEFAULT_SETTINGS);
  });

  it("resets only the invalid field and names it", () => {
    const raw = JSON.stringify({ ...DEFAULT_SETTINGS, firstLaunchComplete: true, mode: "mock", inactivityTimeoutSec: 9999, confirmBeforeClose: false });
    const r = parseSettings(raw);
    expect(r.resetFields).toEqual(["inactivityTimeoutSec"]);
    expect(r.settings.inactivityTimeoutSec).toBe(30);
    expect(r.settings.confirmBeforeClose).toBe(false);
    expect(r.settings.mode).toBe("mock");
  });

  it("forces first launch again when the mode is missing", () => {
    const r = parseSettings(JSON.stringify({ ...DEFAULT_SETTINGS, firstLaunchComplete: true, mode: null }));
    expect(r.settings.firstLaunchComplete).toBe(false);
  });

  it("never persists unknown keys such as secrets", () => {
    const raw = JSON.stringify({ ...DEFAULT_SETTINGS, apiKey: "sk-abcdefghijklmnopqrstuvwxyz123456", password: "hunter2" });
    const out = serializeSettings(parseSettings(raw).settings);
    expect(out).not.toContain("sk-abcdef");
    expect(out).not.toContain("hunter2");
    expect(containsSecretPattern(parseSettings(raw).settings)).toBe(false);
  });

  it("rejects a non-loopback host and bad ports", () => {
    expect(validateHost("127.0.0.1")).toBeNull();
    expect(validateHost("192.168.1.5")).toMatch(/Host/);
    expect(validateHost("localhost")).toMatch(/Host/);
    expect(validatePort("8765")).toBeNull();
    expect(validatePort("1023")).toMatch(/Port/);
    expect(validatePort("65536")).toMatch(/Port/);
    expect(validatePort("80a")).toMatch(/Port/);
    expect(validatePort("")).toMatch(/Port/);
  });

  it("validates the inactivity timeout range", () => {
    expect(validateTimeout("10")).toBeNull();
    expect(validateTimeout("120")).toBeNull();
    expect(validateTimeout("9")).toMatch(/10 to 120/);
    expect(validateTimeout("121")).toMatch(/10 to 120/);
    expect(validateTimeout("abc")).toMatch(/10 to 120/);
    expect(validateTimeout("12.5")).toMatch(/10 to 120/);
  });
});
