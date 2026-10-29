import { BUILD_INFO, KNOWN_LIMITATIONS, PRIVACY_DISCLOSURE, PRIVACY_FOOTNOTE, SHORTCUTS, TROUBLESHOOTING } from "../lib/info";

const or = (v: string) => (v && v.length > 0 ? v : "Unavailable");

export function AboutView() {
  return (
    <section aria-labelledby="about-h" className="panel wide">
      <h1 id="about-h">About {BUILD_INFO.productName}</h1>
      <dl className="kv">
        <dt>Product</dt>
        <dd>{or(BUILD_INFO.productName)}</dd>
        <dt>Desktop UI version</dt>
        <dd>{or(BUILD_INFO.version)}</dd>
        <dt>Build date</dt>
        <dd>{or(BUILD_INFO.buildDate)}</dd>
        <dt>Contract version</dt>
        <dd>{BUILD_INFO.contractVersion}</dd>
        <dt>Backend</dt>
        <dd>Backend version: not reported</dd>
        <dt>Notice</dt>
        <dd>{or(BUILD_INFO.notice)}</dd>
      </dl>

      <h2>Privacy</h2>
      <ul>
        {PRIVACY_DISCLOSURE.map((p) => (
          <li key={p.provider}>
            <strong>{p.feature}</strong> uses {p.provider}. {p.data}
          </li>
        ))}
      </ul>
      <p>{PRIVACY_FOOTNOTE}</p>

      <h2>Keyboard shortcuts</h2>
      <table>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys}>
              <th scope="row">
                <kbd>{s.keys}</kbd>
              </th>
              <td>{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Troubleshooting</h2>
      {TROUBLESHOOTING.map((t) => (
        <details key={t.topic}>
          <summary>{t.topic}</summary>
          <p>
            <strong>What you see:</strong> {t.symptom}
          </p>
          <ol>
            {t.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>
      ))}

      <h2>Known limitations</h2>
      <ul>
        {KNOWN_LIMITATIONS.map((k) => (
          <li key={k.text}>
            <span className={`pill pill-${k.label === "Mocked" ? "mock" : "pending"}`}>{k.label}</span> {k.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
