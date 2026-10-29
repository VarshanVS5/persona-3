// Original, source-code-driven SVG character. It mirrors app state; it is never evidence of success.
import { useEffect, useState } from "react";
import { CHARACTER_LABEL, type CharacterState } from "../../lib/outcome";

const TRANSIENT: CharacterState[] = ["success", "error", "cancelled"];
export const RETURN_TO_IDLE_MS = 5000;

/** Req 16.8: success/error/cancelled poses relax back to idle after 5 s. The Result panel keeps the text. */
export function useDisplayedCharacter(target: CharacterState): CharacterState {
  const [relaxed, setRelaxed] = useState<CharacterState | null>(null);
  useEffect(() => {
    setRelaxed(null);
    if (!TRANSIENT.includes(target)) return;
    const id = setTimeout(() => setRelaxed("idle"), RETURN_TO_IDLE_MS);
    return () => clearTimeout(id);
  }, [target]);
  return relaxed ?? target;
}

function Eyes({ state }: { state: CharacterState }) {
  switch (state) {
    case "error":
      return (
        <g className="char-eyes" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M38 44l10 10M48 44l-10 10M72 44l10 10M82 44l-10 10" />
        </g>
      );
    case "cancelled":
      return (
        <g className="char-eyes" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M38 50h10M72 50h10" />
        </g>
      );
    case "success":
      return (
        <g className="char-eyes" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M38 52q5-8 10 0M72 52q5-8 10 0" />
        </g>
      );
    case "thinking":
      return (
        <g className="char-eyes" fill="currentColor">
          <ellipse cx="43" cy="46" rx="5" ry="6" />
          <ellipse cx="77" cy="46" rx="5" ry="6" />
        </g>
      );
    case "listening":
      return (
        <g className="char-eyes" fill="currentColor">
          <ellipse cx="43" cy="50" rx="7" ry="8" />
          <ellipse cx="77" cy="50" rx="7" ry="8" />
        </g>
      );
    default:
      return (
        <g className="char-eyes" fill="currentColor">
          <ellipse cx="43" cy="50" rx="5" ry="6" />
          <ellipse cx="77" cy="50" rx="5" ry="6" />
        </g>
      );
  }
}

function Mouth({ state }: { state: CharacterState }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const };
  switch (state) {
    case "success":
      return <path className="char-mouth" d="M50 70q10 10 20 0" {...p} />;
    case "error":
      return <path className="char-mouth" d="M50 76q10-10 20 0" {...p} />;
    case "thinking":
      return <circle className="char-mouth" cx="60" cy="72" r="4" fill="none" stroke="currentColor" strokeWidth="3" />;
    case "listening":
      return <ellipse className="char-mouth" cx="60" cy="72" rx="6" ry="4" fill="currentColor" />;
    case "approval_required":
      return <path className="char-mouth" d="M52 72h16" {...p} />;
    default:
      return <path className="char-mouth" d="M52 72h16" {...p} />;
  }
}

export interface CharacterProps {
  state: CharacterState;
  mock: boolean;
  /** Extra honest note, e.g. "Task reported complete but is not fully verified". */
  note?: string;
}

export function Character({ state, mock, note }: CharacterProps) {
  return (
    <div className="character" data-state={state}>
      <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`ATLAS status character: ${CHARACTER_LABEL[state]}`} className={`char char-${state}`}>
        <g className="char-body">
          <line x1="60" y1="12" x2="60" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <circle className="char-light" cx="60" cy="10" r="5" />
          <rect x="22" y="24" width="76" height="64" rx="18" className="char-head" />
          <rect x="30" y="32" width="60" height="48" rx="12" className="char-face" />
          <Eyes state={state} />
          <Mouth state={state} />
          {state === "approval_required" && <path className="char-hand" d="M104 62l8-14 6 6-6 12z" fill="currentColor" />}
          <rect x="40" y="92" width="40" height="14" rx="6" className="char-head" />
        </g>
        {state === "listening" && <circle className="char-ring" cx="60" cy="56" r="46" fill="none" stroke="currentColor" strokeWidth="2" />}
      </svg>
      {mock && <span className="badge badge-mock">MOCK</span>}
      <p className="char-state" role="status" aria-live="off">
        {CHARACTER_LABEL[state]}
      </p>
      {note && <p className="char-note">{note}</p>}
    </div>
  );
}
