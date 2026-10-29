import { redact } from "../../lib/redactor";
import type { TranscriptItem } from "../../hooks/useAtlas";

export function TranscriptPanel({ items, modeLabel }: { items: TranscriptItem[]; modeLabel: string | null }) {
  return (
    <section aria-labelledby="transcript-h" className="panel transcript">
      <h2 id="transcript-h">Transcript</h2>
      {items.length === 0 ? (
        <p className="empty">No requests yet. Type a request below.</p>
      ) : (
        <ol className="transcript-list">
          {items.map((it) => (
            <li key={it.id} className={`tr-${it.role}`}>
              <span className="tr-role">{it.role === "user" ? "You" : "ATLAS"}</span>
              <span className="tr-text">{redact(it.text)}</span>
              {it.outcome && <span className={`pill pill-${it.outcome}`}>{it.outcome}</span>}
              {modeLabel && it.role === "system" && <span className="pill pill-mode">{modeLabel}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
