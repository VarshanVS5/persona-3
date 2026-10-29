// Redactor (Req 13.5-13.7, 19). Pure, idempotent, and fail-closed.

export const REDACTED = "[redacted]";

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const AWS_ACCESS_KEY = /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[A-Z0-9]{16}\b/g;
const PREFIXED_KEY = /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g;
const KEY_VALUE =
  /\b(api[_-]?key|apikey|access[_-]?key|secret(?:[_-]?key)?|client[_-]?secret|token|password|passwd|pwd|authorization)\b(["']?\s*[:=]\s*["']?)([^\s"',;&]+)/gi;

/** Masks secret-like values. Throws never: on any internal failure the whole text is masked. */
export function redact(input: string): string {
  try {
    if (typeof input !== "string") return REDACTED;
    let out = input.replace(PRIVATE_KEY_BLOCK, REDACTED);
    out = out.replace(BEARER, `Bearer ${REDACTED}`);
    out = out.replace(AWS_ACCESS_KEY, REDACTED);
    out = out.replace(PREFIXED_KEY, REDACTED);
    out = out.replace(KEY_VALUE, (_m, key: string, sep: string) => `${key}${sep}${REDACTED}`);
    return out;
  } catch {
    return REDACTED;
  }
}

/** Redacts every string inside a JSON-like value and returns pretty text for display. */
export function redactJson(value: unknown): string {
  try {
    return redact(JSON.stringify(value, null, 2) ?? "");
  } catch {
    return REDACTED;
  }
}

export function containsRedaction(text: string): boolean {
  return text.includes(REDACTED);
}
