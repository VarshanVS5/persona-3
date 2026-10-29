import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { initialTaskState, taskReducer, type JournalEntry, type TaskState } from "../lib/eventReducer";
import { deriveOutcome, type OutcomeLabel } from "../lib/outcome";
import type { BackendStatus } from "../lib/mode";
import { ClientError, type AtlasClientApi, type ErrorCategory } from "../services/client";
import { isTerminal, type TaskStatus } from "../types/contract";
import { redact } from "../lib/redactor";

export const MAX_REQUEST_CHARS = 2000;

export interface TranscriptItem {
  id: number;
  role: "user" | "system";
  text: string;
  outcome?: OutcomeLabel;
}

export type StreamState = "idle" | "connecting" | "connected" | "reconnecting" | "polling" | "closed";
export type CancelState = "none" | "requested" | "failed";
export interface ConfirmState {
  phase: "idle" | "inflight" | "error" | "unknown";
  message?: string;
}
export interface PlanError {
  category: ErrorCategory;
  message: string;
}

export interface UseAtlasOptions {
  client: AtlasClientApi;
  inactivityTimeoutSec: number;
  /** Poll interval for the SSE fallback (Req 10.11). Overridable for tests. */
  pollMs?: number;
  healthIntervalMs?: number;
}

const ACTIVE_NOT_TERMINAL: TaskStatus[] = ["QUEUED", "PLANNING", "AWAITING_CONFIRMATION", "RUNNING", "VERIFYING", "CANCELLING"];

function errMsg(e: unknown): { category: ErrorCategory; message: string } {
  if (e instanceof ClientError) return { category: e.category, message: redact(e.message) };
  return { category: "unreachable", message: "Unexpected error" };
}

export function validateRequestText(text: string): string | null {
  if (text.trim().length === 0) return "Enter a request before submitting.";
  if (text.length > MAX_REQUEST_CHARS) return `Request is too long: ${text.length} of ${MAX_REQUEST_CHARS} characters.`;
  return null;
}

export function useAtlas(opts: UseAtlasOptions) {
  const { client, inactivityTimeoutSec } = opts;
  const pollMs = opts.pollMs ?? 2000;
  const healthIntervalMs = opts.healthIntervalMs ?? 10_000;

  const [state, dispatch] = useReducer(taskReducer, undefined, initialTaskState);
  const stateRef = useRef<TaskState>(state);
  stateRef.current = state;

  const [composer, setComposer] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [planning, setPlanning] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [stream, setStream] = useState<StreamState>("idle");
  const [cancelState, setCancelState] = useState<CancelState>("none");
  const [cancelMessage, setCancelMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>({ phase: "idle" });
  const [dismissedDigest, setDismissedDigest] = useState<string | null>(null);
  const [archive, setArchive] = useState<JournalEntry[]>([]);
  const [extraJournal, setExtraJournal] = useState<JournalEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [backend, setBackend] = useState<BackendStatus>(
    client.kind === "mock" ? { state: "ok", mockMode: true, latencyMs: 0 } : { state: "checking", mockMode: null, latencyMs: null },
  );

  const unsubscribe = useRef<(() => void) | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasDisconnected = useRef(false);
  const idCounter = useRef(0);
  const activeTaskId = useRef<string | null>(null);

  const nextId = () => (idCounter.current += 1);

  const stopTransport = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  const deliver = useCallback((event: unknown) => {
    dispatch({ kind: "event", event, now: Date.now() });
  }, []);

  const reconcile = useCallback(
    async (taskId: string): Promise<boolean> => {
      try {
        const snap = await client.getTask(taskId);
        if (activeTaskId.current !== taskId) return true;
        for (const ev of snap.events) deliver(ev);
        dispatch({ kind: "status", status: snap.status, now: Date.now() });
        return true;
      } catch (e) {
        const m = errMsg(e);
        dispatch({ kind: "diagnostic", text: `poll failed: ${m.category}` });
        return false;
      }
    },
    [client, deliver],
  );

  const startPolling = useCallback(
    (taskId: string) => {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(() => {
        void reconcile(taskId).then((ok) => {
          if (ok && activeTaskId.current === taskId) setStream((s) => (s === "connected" ? s : "polling"));
        });
      }, pollMs);
    },
    [pollMs, reconcile],
  );

  const startTransport = useCallback(
    (taskId: string) => {
      stopTransport();
      wasDisconnected.current = false;
      unsubscribe.current = client.subscribeEvents(taskId, {
        onEvent: deliver,
        onStatus: (s) => {
          if (activeTaskId.current !== taskId) return;
          if (s === "connected") {
            setStream("connected");
            if (pollTimer.current) {
              clearInterval(pollTimer.current);
              pollTimer.current = null;
            }
            if (wasDisconnected.current) {
              wasDisconnected.current = false;
              void reconcile(taskId); // Req 10.12
            }
          } else if (s === "connecting") {
            setStream("connecting");
          } else if (s === "reconnecting") {
            wasDisconnected.current = true;
            setStream("reconnecting");
            startPolling(taskId);
          }
        },
      });
    },
    [client, deliver, reconcile, startPolling, stopTransport],
  );

  // Stop transport once the task is terminal.
  useEffect(() => {
    if (state.taskId && isTerminal(state.status)) {
      stopTransport();
      setStream("closed");
    }
  }, [state.taskId, state.status, stopTransport]);

  useEffect(() => stopTransport, [stopTransport]);

  // Session journal: merge per-task journals so earlier tasks stay visible.
  useEffect(() => {
    if (state.journal.length === 0) return;
    setArchive((prev) => {
      const keys = new Set(prev.map((j) => `${j.timestamp}|${j.taskId}|${j.type}|${j.detail}`));
      const add = state.journal.filter((j) => !keys.has(`${j.timestamp}|${j.taskId}|${j.type}|${j.detail}`));
      return add.length === 0 ? prev : [...prev, ...add];
    });
  }, [state.journal]);

  // Health polling (live only). Disconnected is shown; there is no automatic fallback to mock.
  useEffect(() => {
    if (client.kind === "mock") return;
    let cancelled = false;
    const check = async () => {
      const t0 = performance.now();
      try {
        const h = await client.health();
        if (!cancelled) setBackend({ state: "ok", mockMode: h.mockMode, latencyMs: Math.round(performance.now() - t0) });
      } catch (e) {
        if (!cancelled) setBackend({ state: "unreachable", mockMode: null, latencyMs: null, error: errMsg(e).message });
      }
    };
    void check();
    const id = setInterval(() => void check(), healthIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [client, healthIntervalMs]);

  const active = state.taskId !== null && state.status !== null && ACTIVE_NOT_TERMINAL.includes(state.status);

  // Inactivity clock (Req 12.7)
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const stale =
    active && state.status !== "AWAITING_CONFIRMATION" && now - state.lastUpdateAt > inactivityTimeoutSec * 1000 && state.lastUpdateAt > 0;

  // Voice transcript -> composer (never auto-submitted)
  const lastFinalId = useRef(0);
  useEffect(() => {
    const f = state.finalTranscript;
    if (f && f.id !== lastFinalId.current) {
      lastFinalId.current = f.id;
      setComposer((c) => (c.trim().length > 0 ? `${c} ${f.text}` : f.text));
    }
  }, [state.finalTranscript]);

  // Add a system transcript line when the outcome label changes.
  const outcome = useMemo(() => deriveOutcome(state), [state]);
  const lastOutcome = useRef<string | null>(null);
  useEffect(() => {
    if (!state.taskId || !outcome) return;
    const key = `${state.taskId}:${outcome.label}:${outcome.note ?? ""}`;
    if (key === lastOutcome.current) return;
    lastOutcome.current = key;
    if (outcome.label === "requested") return;
    setTranscript((t) => [...t, { id: nextId(), role: "system", text: outcome.note ? `${outcome.label} (${outcome.note})` : outcome.label, outcome: outcome.label }]);
  }, [state.taskId, outcome]);

  const submit = useCallback(
    async (text: string): Promise<boolean> => {
      const cur = stateRef.current;
      if (cur.taskId && !isTerminal(cur.status)) return false;
      const problem = validateRequestText(text);
      if (problem) {
        setComposerError(problem);
        return false;
      }
      setComposerError(null);
      setPlanError(null);
      setPlanning(true);
      stopTransport();
      setTranscript((t) => [...t, { id: nextId(), role: "user", text: text.trim(), outcome: "requested" }]);
      try {
        const accepted = await client.plan(text.trim());
        activeTaskId.current = accepted.taskId;
        lastOutcome.current = null;
        setCancelState("none");
        setCancelMessage(null);
        setConfirm({ phase: "idle" });
        setDismissedDigest(null);
        dispatch({ kind: "start", taskId: accepted.taskId, request: text.trim(), status: accepted.status, now: Date.now() });
        setComposer("");
        startTransport(accepted.taskId);
        setPlanning(false);
        return true;
      } catch (e) {
        const m = errMsg(e);
        setPlanError(m);
        setPlanning(false);
        if (m.category === "unreachable" && client.kind === "live") {
          setBackend({ state: "unreachable", mockMode: null, latencyMs: null, error: m.message });
        }
        return false; // composer text is kept for resubmission; nothing is retried automatically
      }
    },
    [client, startTransport, stopTransport],
  );

  const approve = useCallback(async () => {
    const cur = stateRef.current;
    if (!cur.taskId || !cur.confirmation || cur.planChanged || cur.confirmation.highestRiskTier === "T3") return;
    if (cur.confirmation.planDigest !== cur.planDigest) return;
    if (confirm.phase === "inflight") return;
    const taskId = cur.taskId;
    setConfirm({ phase: "inflight" });
    try {
      await client.confirm(taskId, cur.confirmation.planDigest);
      setConfirm({ phase: "idle" });
    } catch (e) {
      const m = errMsg(e);
      if (m.category === "rejected") {
        // e.g. plan changed: show reason and fetch the current plan for review.
        setConfirm({ phase: "error", message: `Approval was rejected: ${m.message}` });
        await reconcile(taskId);
        return;
      }
      // Timeout / network: query task state before offering any retry (Req 12.9).
      try {
        const snap = await client.getTask(taskId);
        for (const ev of snap.events) deliver(ev);
        dispatch({ kind: "status", status: snap.status, now: Date.now() });
        if (snap.status === "AWAITING_CONFIRMATION") {
          setConfirm({ phase: "error", message: `Approval did not reach the backend (${m.category}). You can approve again.` });
        } else {
          setConfirm({ phase: "idle" });
        }
      } catch {
        setConfirm({ phase: "unknown", message: "Task state is unknown. Re-check the task before approving again." });
      }
    }
  }, [client, confirm.phase, deliver, reconcile]);

  const recheck = useCallback(async () => {
    const id = stateRef.current.taskId;
    if (!id) return;
    const ok = await reconcile(id);
    if (ok) setConfirm({ phase: "idle" });
    else setConfirm({ phase: "unknown", message: "Task state is still unknown." });
  }, [reconcile]);

  const cancel = useCallback(async (): Promise<boolean> => {
    const id = stateRef.current.taskId;
    if (!id) return false;
    setCancelState("requested");
    setCancelMessage(null);
    try {
      await client.cancel(id);
      return true;
    } catch (e) {
      setCancelState("failed");
      setCancelMessage(errMsg(e).message);
      return false;
    }
  }, [client]);

  const retryConnection = useCallback(() => {
    const id = stateRef.current.taskId;
    if (!id) return;
    void reconcile(id);
  }, [reconcile]);

  const reset = useCallback(() => {
    stopTransport();
    activeTaskId.current = null;
    dispatch({ kind: "reset" });
    setCancelState("none");
    setConfirm({ phase: "idle" });
    setStream("idle");
  }, [stopTransport]);

  const addJournal = useCallback((entry: JournalEntry) => setExtraJournal((j) => [...j, entry]), []);

  const journal = useMemo(
    () => [...archive, ...extraJournal].sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0)),
    [archive, extraJournal],
  );

  const approvalVisible =
    !!state.confirmation &&
    !state.planChanged &&
    state.status === "AWAITING_CONFIRMATION" &&
    state.confirmation.highestRiskTier !== "T3" &&
    state.confirmation.planDigest === state.planDigest &&
    dismissedDigest !== state.confirmation.planDigest;

  const cancelable = state.taskId !== null && (state.status === "RUNNING" || state.status === "VERIFYING" || state.status === "AWAITING_CONFIRMATION");

  return {
    state,
    dispatch,
    outcome,
    composer,
    setComposer,
    composerError,
    setComposerError,
    planError,
    planning,
    transcript,
    stream,
    cancelState,
    cancelMessage,
    confirm,
    backend,
    stale,
    journal,
    addJournal,
    approvalVisible,
    dismissApproval: () => setDismissedDigest(stateRef.current.confirmation?.planDigest ?? null),
    reopenApproval: () => setDismissedDigest(null),
    cancelable,
    submit,
    approve,
    recheck,
    cancel,
    retryConnection,
    reset,
    acknowledgePlan: () => dispatch({ kind: "acknowledgePlan" }),
    hasActiveTask: state.taskId !== null && !isTerminal(state.status),
  };
}

export type AtlasController = ReturnType<typeof useAtlas>;
