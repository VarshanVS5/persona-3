import { useMemo, useState } from "react";
import type { JournalEntry } from "../lib/eventReducer";
import { redact } from "../lib/redactor";

export function JournalView({ entries }: { entries: JournalEntry[] }) {
  const [taskId, setTaskId] = useState("");
  const [type, setType] = useState("");
  const taskIds = useMemo(() => [...new Set(entries.map((e) => e.taskId))], [entries]);
  const types = useMemo(() => [...new Set(entries.map((e) => e.type))], [entries]);
  const shown = entries.filter((e) => (taskId === "" || e.taskId === taskId) && (type === "" || e.type === type));

  return (
    <section aria-labelledby="journal-h" className="panel wide">
      <h1 id="journal-h">Audit journal</h1>
      <p className="notice">Session events (backend journal unavailable). The backend does not expose a journal endpoint yet, so this lists events this window received.</p>
      <div className="form-row">
        <label htmlFor="j-task">Task</label>
        <select id="j-task" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          <option value="">All tasks</option>
          {taskIds.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label htmlFor="j-type">Event type</label>
        <select id="j-type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {shown.length === 0 ? (
        <p className="empty">No journal entries match.</p>
      ) : (
        <table className="journal">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Task</th>
              <th scope="col">Event</th>
              <th scope="col">Step</th>
              <th scope="col">Detail</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e, i) => (
              <tr key={`${e.timestamp}-${e.type}-${i}`}>
                <td>{e.timestamp}</td>
                <td>{e.taskId}</td>
                <td>{e.type}</td>
                <td>{e.stepId ?? ""}</td>
                <td>{redact(e.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
