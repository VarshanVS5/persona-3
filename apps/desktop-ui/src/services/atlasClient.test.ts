import { describe, expect, it, vi } from "vitest";
import { AtlasClient } from "./atlasClient";
import { ClientError } from "./client";

function res(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

function client(fetchImpl: typeof fetch) {
  return new AtlasClient({ host: "127.0.0.1", port: 8765, fetchImpl });
}

async function catchErr(p: Promise<unknown>): Promise<ClientError> {
  try {
    await p;
  } catch (e) {
    return e as ClientError;
  }
  throw new Error("expected rejection");
}

describe("AtlasClient", () => {
  it("only talks to the loopback origin", () => {
    expect(() => new AtlasClient({ host: "example.com", port: 8765 })).toThrow(ClientError);
    expect(() => new AtlasClient({ host: "127.0.0.1", port: 80 })).toThrow(ClientError);
  });

  it("sends the contract request for plan and validates the response", async () => {
    const f = vi.fn(async () => res({ taskId: "t1", status: "PLANNING" }));
    const r = await client(f as unknown as typeof fetch).plan("open my editor");
    expect(r).toEqual({ taskId: "t1", status: "PLANNING" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8765/api/v1/tasks/plan");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ userRequest: "open my editor" });
  });

  it("sends planDigest on confirm and uses the cancel path", async () => {
    const f = vi.fn(async () => res({}));
    const c = client(f as unknown as typeof fetch);
    await c.confirm("t 1", "sha256:abc");
    await c.cancel("t1");
    const calls = f.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe("http://127.0.0.1:8765/api/v1/tasks/t%201/confirm");
    expect(JSON.parse(calls[0]?.[1].body as string)).toEqual({ planDigest: "sha256:abc" });
    expect(calls[1]?.[0]).toBe("http://127.0.0.1:8765/api/v1/tasks/t1/cancel");
  });

  it("maps a refused connection to unreachable", async () => {
    const c = client((async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch);
    expect((await catchErr(c.health())).category).toBe("unreachable");
  });

  it("maps a stalled request to timeout and aborts it", async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const f = ((_u: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            rej(new DOMException("aborted", "AbortError"));
          });
        })) as unknown as typeof fetch;
      const p = catchErr(client(f).health());
      await vi.advanceTimersByTimeAsync(5001);
      expect((await p).category).toBe("timeout");
      expect(aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns rejected with status and a redacted, truncated message", async () => {
    const secret = "sk-abcdefghijklmnopqrstuvwxyz123456";
    const body = `bad things: Authorization: Bearer abcdefghijkl api_key=${secret} ${"x".repeat(500)}`;
    const err = await catchErr(client((async () => res(body, 500)) as unknown as typeof fetch).plan("hi"));
    expect(err.category).toBe("rejected");
    expect(err.httpStatus).toBe(500);
    expect(err.message).not.toContain(secret);
    expect(err.message).not.toContain("abcdefghijkl");
    expect(err.message.length).toBeLessThanOrEqual(200);
  });

  it("flags invalid JSON and schema-invalid responses", async () => {
    expect((await catchErr(client((async () => res("<html>")) as unknown as typeof fetch).health())).category).toBe("invalid_response");
    expect((await catchErr(client((async () => res({ status: "ok" })) as unknown as typeof fetch).health())).category).toBe("invalid_response");
    expect((await catchErr(client((async () => res({ taskId: "t1", status: "RUNNING", events: [{ type: "bogus" }] })) as unknown as typeof fetch).getTask("t1"))).category).toBe("invalid_response");
  });

  it("subscribes to the SSE path and forwards parsed events", () => {
    const urls: string[] = [];
    class FakeES {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((m: MessageEvent) => void) | null = null;
      constructor(url: string) {
        urls.push(url);
        FakeES.last = this;
      }
      close() {}
      static last: FakeES;
    }
    const c = new AtlasClient({ host: "127.0.0.1", port: 8765, fetchImpl: fetch, eventSourceImpl: FakeES as unknown as typeof EventSource });
    const got: unknown[] = [];
    const statuses: string[] = [];
    c.subscribeEvents("t1", { onEvent: (e) => got.push(e), onStatus: (s) => statuses.push(s) });
    expect(urls[0]).toBe("http://127.0.0.1:8765/api/v1/tasks/t1/events");
    FakeES.last.onopen?.();
    FakeES.last.onmessage?.({ data: '{"a":1}' } as MessageEvent);
    FakeES.last.onmessage?.({ data: "not json" } as MessageEvent);
    FakeES.last.onerror?.();
    expect(got).toEqual([{ a: 1 }, undefined]);
    expect(statuses).toEqual(["connecting", "connected", "reconnecting"]);
  });
});
