import type { AtlasEvent, Health, PlanAccepted, TaskSnapshot } from "../types/contract";

export type ErrorCategory = "unreachable" | "timeout" | "rejected" | "invalid_response";

export class ClientError extends Error {
  readonly category: ErrorCategory;
  readonly httpStatus: number | undefined;
  constructor(category: ErrorCategory, message: string, httpStatus?: number) {
    super(message);
    this.name = "ClientError";
    this.category = category;
    this.httpStatus = httpStatus;
  }
}

export type StreamStatus = "connecting" | "connected" | "reconnecting" | "closed";

export interface StreamHandlers {
  onEvent: (event: unknown) => void;
  onStatus: (status: StreamStatus) => void;
}

/** Shared interface for AtlasClient (live) and MockClient (fixtures). Selected only by the user's explicit mode. */
export interface AtlasClientApi {
  readonly kind: "live" | "mock";
  plan(userRequest: string): Promise<PlanAccepted>;
  confirm(taskId: string, planDigest: string): Promise<void>;
  cancel(taskId: string): Promise<void>;
  getTask(taskId: string): Promise<TaskSnapshot>;
  health(): Promise<Health>;
  /** Returns an unsubscribe function. Events are delivered unvalidated; the reducer validates them. */
  subscribeEvents(taskId: string, handlers: StreamHandlers): () => void;
}

export type { AtlasEvent };

export const TIMEOUTS_MS = { plan: 15_000, confirm: 10_000, cancel: 5_000, getTask: 5_000, health: 5_000 } as const;
