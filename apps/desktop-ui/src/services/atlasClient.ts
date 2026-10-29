// Live client for the local backend (docs/api-contract.md). All PROPOSED field names are isolated here.
import type { Health, PlanAccepted, TaskSnapshot } from "../types/contract";
import { redact } from "../lib/redactor";
import { validateHealth, validatePlanAccepted, validateSnapshot } from "../lib/validation";
import { REQUIRED_HOST } from "../lib/settings";
import { ClientError, TIMEOUTS_MS, type AtlasClientApi, type StreamHandlers } from "./client";

export interface AtlasClientOptions {
  host: string;
  port: number;
  fetchImpl?: typeof fetch;
  eventSourceImpl?: typeof EventSource;
}

export class AtlasClient implements AtlasClientApi {
  readonly kind = "live" as const;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly eventSourceImpl: typeof EventSource | undefined;

  constructor(opts: AtlasClientOptions) {
    // Req 18.7: only the loopback origin is ever contacted.
    if (opts.host !== REQUIRED_HOST) throw new ClientError("rejected", `Refusing to contact host other than ${REQUIRED_HOST}`);
    if (!Number.isInteger(opts.port) || opts.port < 1024 || opts.port > 65535) {
      throw new ClientError("rejected", "Port out of range");
    }
    this.base = `http://${REQUIRED_HOST}:${opts.port}`;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.eventSourceImpl = opts.eventSourceImpl ?? (typeof EventSource !== "undefined" ? EventSource : undefined);
  }

  private async request(method: "GET" | "POST", path: string, timeoutMs: number, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const init: RequestInit = { method, signal: controller.signal, headers: { Accept: "application/json" } };
      if (body !== undefined) {
        init.body = JSON.stringify(body);
        init.headers = { Accept: "application/json", "Content-Type": "application/json" };
      }
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.base}${path}`, init);
      } catch {
        if (controller.signal.aborted) throw new ClientError("timeout", `No response within ${timeoutMs / 1000} s`);
        throw new ClientError("unreachable", "Backend is unreachable");
      }
      if (!res.ok) {
        let text = "";
        try {
          text = await res.text();
        } catch {
          text = "";
        }
        throw new ClientError("rejected", redact(text).slice(0, 200) || `HTTP ${res.status}`, res.status);
      }
      try {
        const text = await res.text();
        return text.length === 0 ? {} : (JSON.parse(text) as unknown);
      } catch {
        if (controller.signal.aborted) throw new ClientError("timeout", `No response within ${timeoutMs / 1000} s`);
        throw new ClientError("invalid_response", "Response was not valid JSON");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async plan(userRequest: string): Promise<PlanAccepted> {
    const raw = await this.request("POST", "/api/v1/tasks/plan", TIMEOUTS_MS.plan, { userRequest });
    const v = validatePlanAccepted(raw);
    if (!v.ok) throw new ClientError("invalid_response", v.reason);
    return v.value;
  }

  async confirm(taskId: string, planDigest: string): Promise<void> {
    await this.request("POST", `/api/v1/tasks/${encodeURIComponent(taskId)}/confirm`, TIMEOUTS_MS.confirm, { planDigest });
  }

  async cancel(taskId: string): Promise<void> {
    await this.request("POST", `/api/v1/tasks/${encodeURIComponent(taskId)}/cancel`, TIMEOUTS_MS.cancel, {});
  }

  async getTask(taskId: string): Promise<TaskSnapshot> {
    const raw = await this.request("GET", `/api/v1/tasks/${encodeURIComponent(taskId)}`, TIMEOUTS_MS.getTask);
    const v = validateSnapshot(raw);
    if (!v.ok) throw new ClientError("invalid_response", v.reason);
    return v.value;
  }

  async health(): Promise<Health> {
    const raw = await this.request("GET", "/api/v1/health", TIMEOUTS_MS.health);
    const v = validateHealth(raw);
    if (!v.ok) throw new ClientError("invalid_response", v.reason);
    return v.value;
  }

  subscribeEvents(taskId: string, handlers: StreamHandlers): () => void {
    const ES = this.eventSourceImpl;
    if (!ES) {
      handlers.onStatus("reconnecting");
      return () => undefined;
    }
    handlers.onStatus("connecting");
    const source = new ES(`${this.base}/api/v1/tasks/${encodeURIComponent(taskId)}/events`);
    source.onopen = () => handlers.onStatus("connected");
    source.onerror = () => handlers.onStatus("reconnecting");
    source.onmessage = (msg: MessageEvent) => {
      try {
        handlers.onEvent(JSON.parse(String(msg.data)) as unknown);
      } catch {
        handlers.onEvent(undefined); // reducer records a diagnostic for malformed events
      }
    };
    return () => {
      source.close();
      handlers.onStatus("closed");
    };
  }
}
