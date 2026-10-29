import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { LIVE_SETTINGS_JSON, MOCK_SETTINGS_JSON, StubClient, ev, makePlan, memoryStorage } from "./test/helpers";
import { MockClient } from "./services/mockClient";
import { ClientError, type AtlasClientApi } from "./services/client";

const step = { stepId: 1, actionType: "app.open" };

function renderMock(json = MOCK_SETTINGS_JSON) {
  const storage = memoryStorage(json);
  const client = new MockClient({ delayMs: 0 });
  render(<App storage={storage} createClient={() => client} pollMs={50} />);
  return { storage, client };
}

function renderLive(stub: StubClient, json = LIVE_SETTINGS_JSON) {
  const storage = memoryStorage(json);
  render(<App storage={storage} createClient={() => stub as AtlasClientApi} pollMs={30} />);
  return { storage };
}

async function submit(text: string) {
  const user = userEvent.setup();
  const box = await screen.findByLabelText("Command");
  await user.clear(box);
  await user.type(box, text);
  await user.click(screen.getByRole("button", { name: "Plan request" }));
  return user;
}

describe("first launch", () => {
  it("preselects nothing, requires acknowledgement, and persists the chosen mode", async () => {
    const storage = memoryStorage(null);
    render(<App storage={storage} createClient={() => new MockClient({ delayMs: 0 })} />);
    const user = userEvent.setup();
    const cont = await screen.findByRole("button", { name: "Continue" });
    expect(cont).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Mock mode/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Live mode/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Mock mode/ })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /I have read this/ }));
    await user.click(screen.getByRole("radio", { name: /Mock mode/ }));
    expect(cont).toBeEnabled();
    await user.click(cont);
    await screen.findByLabelText("Command");
    const saved = JSON.parse(storage.data ?? "{}");
    expect(saved).toMatchObject({ mode: "mock", firstLaunchComplete: true });
  });

  it("shows an error and stays on the flow when saving fails", async () => {
    const storage = memoryStorage(null);
    storage.failWrites = true;
    render(<App storage={storage} createClient={() => new MockClient({ delayMs: 0 })} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /I have read this/ }));
    await user.click(screen.getByRole("radio", { name: /Mock mode/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/could not be saved/)).toBeInTheDocument();
  });

  it("rejects a non-loopback host in live mode and names the field", async () => {
    const stub = new StubClient();
    render(<App storage={memoryStorage(null)} createClient={() => stub} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /I have read this/ }));
    await user.click(screen.getByRole("radio", { name: /Live mode/ }));
    const host = await screen.findByLabelText("Host");
    await user.clear(host);
    await user.type(host, "10.0.0.5");
    expect(await screen.findByText("Host must be 127.0.0.1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("starts from defaults and tells the user when the settings file is corrupt", async () => {
    render(<App storage={memoryStorage("{broken")} createClient={() => new MockClient({ delayMs: 0 })} />);
    expect(await screen.findByText(/reset to defaults/)).toBeInTheDocument();
  });
});

describe("mock mode workflow", () => {
  it("runs request -> plan -> approval -> timeline -> result, always labelled MOCK", async () => {
    renderMock();
    expect(await screen.findByTestId("mode-indicator")).toHaveTextContent("Mock mode (UI fixtures)");
    const user = await submit("open my editor");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/MOCK - nothing was executed/)).toBeInTheDocument();
    expect(within(dialog).getByText("Highest risk:", { exact: false })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("Outcome: verified"));
    expect(screen.getAllByText(/MOCK - nothing was executed/).length).toBeGreaterThan(2);
    // Mock fixtures never trigger the success character.
    expect(document.querySelector(".character")?.getAttribute("data-state")).not.toBe("success");
    expect(screen.getByText("1 of 1 steps completed")).toBeInTheDocument();
  });

  it("shows a failed result with recovery guidance for the failure fixture", async () => {
    renderMock();
    const user = await submit("make this fail please");
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("Outcome: failed"));
    expect(screen.getByText(/What to do/)).toBeInTheDocument();
    expect(screen.getByText(/Failed step: 1/)).toBeInTheDocument();
    expect(document.querySelector(".character")?.getAttribute("data-state")).toBe("error");
  });

  it("never offers Approve for a T3 plan", async () => {
    renderMock();
    await submit("run a shell command");
    await screen.findByText(/Blocked or requires separate authorization/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("rejecting reports cancelled only after the backend says so", async () => {
    renderMock();
    const user = await submit("open my editor");
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(screen.getByTestId("cancel-status")).toHaveTextContent("Cancellation confirmed"));
    expect(screen.getByTestId("outcome")).toHaveTextContent("cancelled");
  });

  it("Escape closes the approval dialog without approving, and focus returns to the composer", async () => {
    const { client } = renderMock();
    const user = await submit("open my editor");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((await client.getTask("mock-0001")).status).toBe("AWAITING_CONFIRMATION");
    expect(screen.getByLabelText("Command")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Review and approve" })).toBeInTheDocument();
  });

  it("traps Tab inside the approval dialog", async () => {
    renderMock();
    const user = await submit("open my editor");
    const dialog = await screen.findByRole("dialog");
    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});

describe("composer validation", () => {
  it("rejects empty and over-length requests without calling the client", async () => {
    const stub = new StubClient();
    renderLive(stub);
    const user = userEvent.setup();
    await screen.findByLabelText("Command");
    await user.click(screen.getByRole("button", { name: "Plan request" }));
    expect(await screen.findByText("Enter a request before submitting.")).toBeInTheDocument();
    const box = screen.getByLabelText("Command");
    await user.click(box);
    await user.paste("a".repeat(2001));
    await user.click(screen.getByRole("button", { name: "Plan request" }));
    expect(await screen.findByText(/2001 of 2000/)).toBeInTheDocument();
    expect(stub.calls).not.toContain("plan");
    expect((box as HTMLTextAreaElement).value.length).toBe(2001);
  });
});

describe("live mode", () => {
  it("shows Disconnected when the backend is unreachable, keeps the text, and does not fall back to mock", async () => {
    const stub = new StubClient();
    stub.healthImpl = async () => {
      throw new ClientError("unreachable", "Backend is unreachable");
    };
    stub.planImpl = async () => {
      throw new ClientError("unreachable", "Backend is unreachable");
    };
    renderLive(stub);
    await waitFor(() => expect(screen.getByTestId("mode-indicator")).toHaveTextContent("Disconnected"));
    await submit("open my editor");
    expect(await screen.findByText(/Backend unreachable/)).toBeInTheDocument();
    expect((screen.getByLabelText("Command") as HTMLTextAreaElement).value).toBe("open my editor");
    expect(screen.getByTestId("mode-indicator")).not.toHaveTextContent("Mock");
  });

  it("distinguishes Live mode from Backend mock mode", async () => {
    const stub = new StubClient();
    renderLive(stub);
    await waitFor(() => expect(screen.getByTestId("mode-indicator")).toHaveTextContent("Live mode"));
  });

  it("labels backend-simulated results", async () => {
    const stub = new StubClient();
    stub.healthImpl = async () => ({ status: "ok", mockMode: true });
    renderLive(stub);
    await waitFor(() => expect(screen.getByTestId("mode-indicator")).toHaveTextContent("Backend mock mode"));
    await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({ requiresConfirmation: false }), planDigest: "d1" }));
    expect((await screen.findAllByText("SIMULATED by backend")).length).toBeGreaterThan(0);
  });

  it("SUCCEEDED without verification evidence is not shown as verified or as success", async () => {
    const stub = new StubClient();
    renderLive(stub);
    await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({ requiresConfirmation: false }), planDigest: "d1" }));
    stub.push(ev("task_completed", { status: "SUCCEEDED" }));
    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("verification evidence missing"));
    expect(screen.getByTestId("outcome")).not.toHaveTextContent("Outcome: verified");
    expect(document.querySelector(".character")?.getAttribute("data-state")).toBe("idle");
    expect(screen.getByText(/not fully verified/)).toBeInTheDocument();
  });

  it("shows verified success only with evidence, and the success character in live mode", async () => {
    const stub = new StubClient();
    renderLive(stub);
    await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({ requiresConfirmation: false }), planDigest: "d1" }));
    stub.push(ev("step_started", step));
    stub.push(ev("verification_passed", step));
    stub.push(ev("task_completed", { status: "SUCCEEDED" }));
    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("Outcome: verified"));
    expect(document.querySelector(".character")?.getAttribute("data-state")).toBe("success");
  });

  it("sends the displayed planDigest on approval and never before the user clicks", async () => {
    const stub = new StubClient();
    renderLive(stub);
    const user = await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan(), planDigest: "sha256:reviewed" }));
    stub.push(ev("confirmation_required", { planDigest: "sha256:reviewed", highestRiskTier: "T1" }));
    const dialog = await screen.findByRole("dialog");
    expect(stub.calls.filter((c) => c.startsWith("confirm"))).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(stub.calls).toContain("confirm:sha256:reviewed");
  });

  it("requires a second confirmation for T2", async () => {
    const stub = new StubClient();
    renderLive(stub);
    const user = await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({}, "T2"), planDigest: "d2" }));
    stub.push(ev("confirmation_required", { planDigest: "d2", highestRiskTier: "T2" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /second confirmation/ }));
    expect(stub.calls.filter((c) => c.startsWith("confirm"))).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: /Confirm and approve/ }));
    expect(stub.calls).toContain("confirm:d2");
  });

  it("disables approval when the plan digest changes until the user reviews it", async () => {
    const stub = new StubClient();
    renderLive(stub);
    await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan(), planDigest: "d1" }));
    stub.push(ev("confirmation_required", { planDigest: "d1", highestRiskTier: "T1" }));
    await screen.findByRole("dialog");
    stub.push(ev("plan_ready", { plan: makePlan({ summary: "Something else" }), planDigest: "d2" }));
    await screen.findByText(/Plan changed - review again/);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });

  it("queries the task before offering a confirm retry after a timeout", async () => {
    const stub = new StubClient();
    stub.confirmImpl = async () => {
      throw new ClientError("timeout", "No response");
    };
    renderLive(stub);
    const user = await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan(), planDigest: "d1" }));
    stub.push(ev("confirmation_required", { planDigest: "d1", highestRiskTier: "T1" }));
    stub.status = "AWAITING_CONFIRMATION";
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Approve" }));
    await screen.findByText(/did not reach the backend/);
    const order = stub.calls.filter((c) => c.startsWith("confirm") || c === "getTask");
    expect(order.indexOf("getTask")).toBeGreaterThan(order.findIndex((c) => c.startsWith("confirm")));
  });

  it("does not offer a retry when the state query also fails", async () => {
    const stub = new StubClient();
    stub.confirmImpl = async () => {
      throw new ClientError("unreachable", "down");
    };
    stub.getTaskImpl = async () => {
      throw new ClientError("unreachable", "down");
    };
    renderLive(stub);
    const user = await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan(), planDigest: "d1" }));
    stub.push(ev("confirmation_required", { planDigest: "d1", highestRiskTier: "T1" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    await screen.findByText(/Task state is unknown/);
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Re-check task state" })).toBeInTheDocument();
  });

  it("cancel: requested -> cancelling -> confirmed only when the backend reports it", async () => {
    const stub = new StubClient();
    renderLive(stub);
    const user = await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({ requiresConfirmation: false }), planDigest: "d1" }));
    stub.push(ev("step_started", step));
    await user.click(await screen.findByRole("button", { name: "Cancel task" }));
    expect(await screen.findByTestId("cancel-status")).toHaveTextContent("Cancellation requested");
    expect(screen.getByTestId("cancel-status")).not.toHaveTextContent("confirmed");
    stub.push(ev("task_cancelled", { status: "CANCELLED" }));
    await waitFor(() => expect(screen.getByTestId("cancel-status")).toHaveTextContent("Cancellation confirmed"));
  });

  it("cancel failure shows 'Cancellation not confirmed' and offers a retry", async () => {
    const stub = new StubClient();
    stub.cancelImpl = async () => {
      throw new ClientError("timeout", "No response within 5 s");
    };
    renderLive(stub);
    const user = await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({ requiresConfirmation: false }), planDigest: "d1" }));
    stub.push(ev("step_started", step));
    await user.click(await screen.findByRole("button", { name: "Cancel task" }));
    await waitFor(() => expect(screen.getByTestId("cancel-status")).toHaveTextContent("Cancellation not confirmed"));
    expect(screen.getByRole("button", { name: "Retry cancel" })).toBeEnabled();
  });

  it("Ctrl+. cancels and Ctrl+K focuses the composer", async () => {
    const stub = new StubClient();
    renderLive(stub);
    const user = await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({ requiresConfirmation: false }), planDigest: "d1" }));
    stub.push(ev("step_started", step));
    await screen.findByRole("button", { name: "Cancel task" });
    await user.keyboard("{Control>}.{/Control}");
    await waitFor(() => expect(stub.calls).toContain("cancel"));
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Control>}k{/Control}");
    expect(screen.getByLabelText("Command")).toHaveFocus();
  });

  it("falls back to polling when the stream drops and reconciles from the task snapshot", async () => {
    const stub = new StubClient();
    renderLive(stub);
    await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({ requiresConfirmation: false }), planDigest: "d1" }));
    const s1 = ev("step_started", step);
    const s2 = ev("verification_passed", step);
    const s3 = ev("task_completed", { status: "SUCCEEDED" });
    stub.events.push(s1, s2, s3); // backend knows these; the stream missed them
    stub.status = "SUCCEEDED";
    stub.handlers?.onStatus("reconnecting");
    await screen.findByText(/Reconnecting/);
    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("Outcome: verified"));
  });

  it("reports 'No update from backend' after the inactivity timeout", async () => {
    const stub = new StubClient();
    const json = JSON.stringify({ ...JSON.parse(LIVE_SETTINGS_JSON), inactivityTimeoutSec: 10 });
    const realNow = Date.now;
    renderLive(stub, json);
    await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({ requiresConfirmation: false }), planDigest: "d1" }));
    stub.push(ev("step_started", step));
    await screen.findByRole("button", { name: "Cancel task" });
    Date.now = () => realNow() + 11_000;
    try {
      expect(await screen.findByText("No update from backend.", {}, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry connection" })).toBeInTheDocument();
    } finally {
      Date.now = realNow;
    }
  });
});

describe("secret non-leakage", () => {
  it("never renders, stores or journals seeded secrets", async () => {
    const SECRET = "sk-abcdefghijklmnopqrstuvwxyz123456";
    const PW = "hunter2hunter2";
    const stub = new StubClient();
    const { storage } = renderLive(stub);
    const user = await submit("open my editor");
    const plan = makePlan({ summary: `Open editor with api_key=${SECRET}` });
    plan.steps[0]!.arguments = { note: `password=${PW}`, auth: `Bearer ${SECRET}` };
    stub.push(ev("plan_ready", { plan, planDigest: "d1" }));
    stub.push(ev("confirmation_required", { planDigest: "d1", highestRiskTier: "T1" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    stub.push(ev("step_started", step));
    stub.push(ev("verification_failed", { ...step, reason: `login token=${SECRET} password: ${PW}` }));
    stub.push(ev("task_failed", { status: "FAILED", reason: `failed with Authorization: Bearer ${SECRET}`, failedStepId: 1 }));
    stub.push(ev("provider_error", { provider: "9router", code: "E1", message: `key ${SECRET}`, retryable: false }));
    await waitFor(() => expect(screen.getByTestId("outcome")).toHaveTextContent("failed"));
    await user.click(screen.getByRole("button", { name: "Audit journal" }));
    await screen.findByRole("table");
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await screen.findByRole("heading", { name: "Settings" });
    const text = document.body.textContent ?? "";
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(PW);
    expect(storage.data ?? "").not.toContain(SECRET);
  });
});

describe("settings screen and accessibility", () => {
  it("rejects an out-of-range timeout, shows the range and keeps the saved value", async () => {
    const { storage } = renderMock();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    const input = await screen.findByLabelText("Inactivity timeout (seconds)");
    await user.clear(input);
    await user.type(input, "5");
    expect(await screen.findByText("Permitted range: 10 to 120 seconds")).toBeInTheDocument();
    expect(JSON.parse(storage.data ?? "{}").inactivityTimeoutSec).toBe(30);
    await user.clear(input);
    await user.type(input, "45");
    await waitFor(() => expect(JSON.parse(storage.data ?? "{}").inactivityTimeoutSec).toBe(45));
  });

  it("has no API key inputs and states permissions are not reported", async () => {
    renderMock();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Allowlisted applications: Not reported by backend/)).toBeInTheDocument();
  });

  it("applies the reduced-motion override to the app root", async () => {
    renderMock(JSON.stringify({ ...JSON.parse(MOCK_SETTINGS_JSON), reducedMotionOverride: true }));
    await screen.findByLabelText("Command");
    expect(document.querySelector(".app")?.getAttribute("data-reduced-motion")).toBe("true");
  });

  it("About lists the shortcuts, six troubleshooting topics and limitations", async () => {
    renderMock();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "About" }));
    expect(screen.getByText("Ctrl+K")).toBeInTheDocument();
    for (const t of ["Backend unreachable", "Backend in mock mode", "Voice unavailable", "Plan rejected", "Verification failed", "Cancellation not confirmed"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.getByText("Backend version: not reported")).toBeInTheDocument();
    expect(screen.getAllByText("Unverified").length).toBeGreaterThan(0);
  });

  it("filters the audit journal by task and event type", async () => {
    const stub = new StubClient();
    renderLive(stub);
    const user = await submit("open my editor");
    stub.push(ev("plan_ready", { plan: makePlan({ requiresConfirmation: false }), planDigest: "d1" }));
    stub.push(ev("step_started", step));
    await user.click(screen.getByRole("button", { name: "Audit journal" }));
    expect(await screen.findByText(/Session events \(backend journal unavailable\)/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Event type"), "step_started");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows.length).toBe(2);
  });
});
