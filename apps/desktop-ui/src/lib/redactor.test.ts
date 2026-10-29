import { describe, expect, it } from "vitest";
import { REDACTED, redact, redactJson } from "./redactor";

const SECRETS = [
  "sk-abcdefghijklmnopqrstuvwxyz123456",
  "AKIAIOSFODNN7EXAMPLE",
  "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
  "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA7\n-----END RSA PRIVATE KEY-----",
];

describe("redact", () => {
  it("masks key=value secrets but keeps the key and surrounding text", () => {
    const out = redact("login failed password=hunter2secret for user bob");
    expect(out).toBe(`login failed password=${REDACTED} for user bob`);
  });

  it("masks JSON style secrets", () => {
    expect(redact('{"api_key":"abc123def456"}')).not.toContain("abc123def456");
    expect(redact('{"token": "zzzz9999"}')).not.toContain("zzzz9999");
  });

  it.each(SECRETS)("never leaks a seeded secret: %s", (secret) => {
    const out = redact(`before ${secret} after`);
    expect(out).not.toContain(secret.split("\n")[1] ?? secret.slice(-12));
    expect(out).toContain(REDACTED);
    expect(out.startsWith("before ")).toBe(true);
  });

  it("is idempotent for a range of inputs", () => {
    const inputs = [
      "",
      "plain text",
      "password: abc authorization: Bearer abcdefgh12345",
      ...SECRETS,
      `mixed ${SECRETS.join(" | ")} token=xyz`,
      "authorization=Bearer abcdefghijkl",
      '{"password":"p","nested":{"secret":"s"}}',
    ];
    for (const i of inputs) {
      const once = redact(i);
      expect(redact(once)).toBe(once);
    }
  });

  it("fails closed when given a non-string", () => {
    expect(redact(undefined as unknown as string)).toBe(REDACTED);
    expect(redact(42 as unknown as string)).toBe(REDACTED);
  });

  it("redacts inside JSON values", () => {
    expect(redactJson({ note: "token=abcdef123", n: 1 })).not.toContain("abcdef123");
  });

  it("leaves ordinary text unchanged", () => {
    const t = "Open the allowlisted editor application.";
    expect(redact(t)).toBe(t);
  });
});
