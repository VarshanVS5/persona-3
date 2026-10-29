import { useEffect, useMemo, useRef, useState } from "react";
import { Character, useDisplayedCharacter } from "../components/Character/Character";
import { CommandBar } from "../components/CommandBar/CommandBar";
import { ConfirmDialog } from "../components/ConfirmDialog/ConfirmDialog";
import { Dialog } from "../components/ConfirmDialog/Dialog";
import { ExecutionLedger } from "../components/ExecutionLedger/ExecutionLedger";
import { ResultPanel, cancelStatusText } from "../components/ExecutionLedger/ResultPanel";
import { PlanInspector } from "../components/PlanInspector/PlanInspector";
import { ConnectionNotice, LiveAnnouncer, ModeIndicator } from "../components/StatusBanner/StatusBanner";
import { TranscriptPanel } from "../components/TranscriptPanel/TranscriptPanel";
import { useAtlas, type AtlasController } from "../hooks/useAtlas";
import { allStepsVerified, characterStateFor } from "../lib/outcome";
import { deriveModeKind, RESULT_LABEL } from "../lib/mode";
import { isTauri, type Settings } from "../lib/settings";
import { highestRisk } from "../types/contract";
import type { AtlasClientApi } from "../services/client";
import { AboutView } from "./AboutView";
import { JournalView } from "./JournalView";
import { SettingsScreen } from "./SettingsScreen";
import type { SettingsApi } from "../hooks/useSettings";

export type View = "task" | "journal" | "settings" | "about";

export interface WorkspaceProps {
  settingsApi: SettingsApi;
  client: AtlasClientApi;
  view: View;
  /** Overridable for tests (pollMs / healthIntervalMs). */
  pollMs?: number;
}

const CLOSE_CANCEL_TIMEOUT_MS = 3000;

function useCloseGuard(ctl: AtlasController, settings: Settings, requestDialog: () => void): { closeNow: () => Promise<void> } {
  const ref = useRef(ctl);
  ref.current = ctl;
  const confirmRef = useRef(settings.confirmBeforeClose);
  confirmRef.current = settings.confirmBeforeClose;

  const closeNow = async () => {
    const c = ref.current;
    const id = c.state.taskId;
    let confirmed = false;
    if (id) {
      confirmed = await Promise.race([c.cancel(), new Promise<boolean>((r) => setTimeout(() => r(false), CLOSE_CANCEL_TIMEOUT_MS))]);
      if (!confirmed) {
        c.addJournal({ timestamp: new Date().toISOString(), taskId: id, type: "window_close", detail: "Window closed; cancellation was not confirmed by the backend" });
      }
    }
    if (isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    }
  };
  const closeRef = useRef(closeNow);
  closeRef.current = closeNow;

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const off = await getCurrentWindow().onCloseRequested((event) => {
        const s = ref.current.state.status;
        const running = s === "RUNNING" || s === "VERIFYING" || s === "CANCELLING";
        if (!running) return; // no active task: close normally (Req 1.9)
        event.preventDefault();
        if (confirmRef.current) requestDialog();
        else void closeRef.current();
      });
      if (disposed) off();
      else unlisten = off;
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { closeNow };
}

export function Workspace({ settingsApi, client, view, pollMs }: WorkspaceProps) {
  const { settings } = settingsApi;
  const ctl = useAtlas({ client, inactivityTimeoutSec: settings.inactivityTimeoutSec, ...(pollMs ? { pollMs, healthIntervalMs: 60_000 } : {}) });
  const { state } = ctl;
  const mock = client.kind === "mock";
  const modeKind = deriveModeKind(mock ? "mock" : "live", ctl.backend);
  const modeLabel = RESULT_LABEL[modeKind] ?? null;
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [closeDialog, setCloseDialog] = useState(false);

  const { closeNow } = useCloseGuard(ctl, settings, () => setCloseDialog(true));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        composerRef.current?.focus();
      } else if (e.ctrlKey && e.key === ".") {
        e.preventDefault();
        if (ctl.cancelable && ctl.cancelState !== "requested") void ctl.cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const verified = allStepsVerified(state);
  const target = characterStateFor(state.status, { listening: state.partialTranscript !== "", allVerified: verified, mock });
  const shown = useDisplayedCharacter(target);
  const unverifiedSuccess = state.status === "SUCCEEDED" && !verified;

  const announce = useMemo(() => {
    const done = state.steps.filter((s) => s.state === "completed").length;
    const parts = [ctl.outcome ? `Outcome ${ctl.outcome.label}${ctl.outcome.note ? `, ${ctl.outcome.note}` : ""}.` : ""];
    if (state.steps.length) parts.push(`${done} of ${state.steps.length} steps completed.`);
    const c = cancelStatusText(state, ctl.cancelState);
    if (c) parts.push(c + ".");
    return parts.join(" ").trim();
  }, [state, ctl.outcome, ctl.cancelState]);

  const busyReason = ctl.hasActiveTask ? `A task is still in progress (${state.status}). Wait for it to finish or cancel it.` : null;
  const tier = state.confirmation?.highestRiskTier ?? (state.plan ? highestRisk(state.plan) : null);

  return (
    <>
      <ModeIndicator kind={modeKind} {...(ctl.backend.error ? { error: ctl.backend.error } : {})} />
      <LiveAnnouncer message={announce} />
      {view === "task" && (
        <main className="workspace" aria-label="Task workspace">
          <div className="col-left">
            <Character state={shown} mock={mock} {...(unverifiedSuccess ? { note: "Task reported complete but is not fully verified." } : {})} />
            <ConnectionNotice stream={ctl.stream} active={ctl.hasActiveTask} />
            <TranscriptPanel items={ctl.transcript} modeLabel={modeLabel} />
            <CommandBar
              ref={composerRef}
              value={ctl.composer}
              onChange={(v) => {
                ctl.setComposer(v);
                ctl.setComposerError(null);
              }}
              onSubmit={() => void ctl.submit(ctl.composer)}
              error={ctl.composerError}
              planError={ctl.planError}
              planning={ctl.planning}
              busyReason={busyReason}
              partialTranscript={state.partialTranscript}
              modeNote={mock ? "Mock mode: try 'open my editor', 'make it fail', or 'run a shell command'." : null}
            />
          </div>
          <div className="col-right">
            <PlanInspector
              state={state}
              modeLabel={modeLabel}
              approvalVisible={ctl.approvalVisible}
              onReopenApproval={ctl.reopenApproval}
              onAcknowledge={ctl.acknowledgePlan}
              onAnswerClarification={(a) => void ctl.submit(a)}
              confirm={ctl.confirm}
              onRecheck={() => void ctl.recheck()}
            />
            <ExecutionLedger state={state} modeLabel={modeLabel} />
            <ResultPanel
              state={state}
              outcome={ctl.outcome}
              modeLabel={modeLabel}
              mock={mock}
              cancelable={ctl.cancelable}
              cancelState={ctl.cancelState}
              cancelMessage={ctl.cancelMessage}
              stale={ctl.stale}
              stream={ctl.stream}
              onCancel={() => void ctl.cancel()}
              onRetryConnection={ctl.retryConnection}
            />
          </div>
        </main>
      )}
      {view === "journal" && <JournalView entries={ctl.journal} />}
      {view === "settings" && (
        <SettingsScreen
          settings={settings}
          save={settingsApi.save}
          saveError={settingsApi.saveError}
          storageKind={settingsApi.storageKind}
          modeKind={modeKind}
          backend={ctl.backend}
          stream={ctl.stream}
          diagnostics={state.diagnostics}
        />
      )}
      {view === "about" && <AboutView />}

      {ctl.approvalVisible && state.plan && state.confirmation && tier && (
        <ConfirmDialog
          plan={state.plan}
          planDigest={state.confirmation.planDigest}
          tier={tier}
          confirm={ctl.confirm}
          modeLabel={modeLabel}
          onApprove={() => void ctl.approve()}
          onReject={() => void ctl.cancel()}
          onDismiss={ctl.dismissApproval}
          onRecheck={() => void ctl.recheck()}
          focusComposer={() => composerRef.current}
        />
      )}
      {closeDialog && (
        <Dialog titleId="close-title" title="Close ATLAS while a task is running?" onDismiss={() => setCloseDialog(false)}>
          <p>
            Task <strong>{state.taskId}</strong> is {state.status}: "{state.request}".
          </p>
          <p>Closing will ask the backend to cancel it. The current action may still finish.</p>
          <div className="button-row">
            <button type="button" className="danger" onClick={() => void closeNow()}>
              Cancel task and close
            </button>
            <button type="button" onClick={() => setCloseDialog(false)}>
              Keep ATLAS open
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
