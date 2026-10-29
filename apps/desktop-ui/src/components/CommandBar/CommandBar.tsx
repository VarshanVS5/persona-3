import { forwardRef } from "react";
import { MAX_REQUEST_CHARS, type PlanError } from "../../hooks/useAtlas";

export interface CommandBarProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  error: string | null;
  planError: PlanError | null;
  planning: boolean;
  /** When set, submission is disabled and this reason is shown (Req 6.5). */
  busyReason: string | null;
  partialTranscript: string;
  modeNote: string | null;
}

const FAILURE_TEXT: Record<string, string> = {
  unreachable: "Backend unreachable",
  timeout: "Request timed out",
  rejected: "Request rejected",
  invalid_response: "Backend sent an invalid response",
};

export const CommandBar = forwardRef<HTMLTextAreaElement, CommandBarProps>(function CommandBar(p, ref) {
  const disabled = p.planning || p.busyReason !== null;
  return (
    <form
      className="command-bar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) p.onSubmit();
      }}
    >
      <label htmlFor="command-input" className="visually-hidden">
        Command
      </label>
      <textarea
        id="command-input"
        ref={ref}
        rows={2}
        value={p.value}
        placeholder="Describe what you want ATLAS to do, e.g. Open my editor"
        aria-describedby="command-help command-error"
        aria-invalid={p.error !== null}
        onChange={(e) => p.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !disabled) {
            e.preventDefault();
            p.onSubmit();
          }
        }}
      />
      <div className="command-row">
        <span id="command-help" className="help">
          {p.value.length}/{MAX_REQUEST_CHARS} - Ctrl+Enter to submit
        </span>
        <button type="submit" className="primary" disabled={disabled}>
          {p.planning ? "Planning..." : "Plan request"}
        </button>
      </div>
      <div id="command-error" aria-live="polite">
        {p.busyReason && <p className="help">{p.busyReason}</p>}
        {p.error && (
          <p role="alert" className="error-text">
            {p.error}
          </p>
        )}
        {p.planError && (
          <p role="alert" className="error-text">
            {FAILURE_TEXT[p.planError.category] ?? "Request failed"}: {p.planError.message}. Your text was kept; submit again when ready.
          </p>
        )}
        {p.modeNote && <p className="help">{p.modeNote}</p>}
        {p.partialTranscript && <p className="help">Hearing: {p.partialTranscript}</p>}
      </div>
    </form>
  );
});
