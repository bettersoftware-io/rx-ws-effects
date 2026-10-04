import type { Observable } from "rxjs";

/** A parsed client → server frame. */
export interface Inbound {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}

/** A server → client frame to be serialised and sent. */
export interface Outbound {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}

/**
 * The one primitive. An effect transforms the inbound message stream into an
 * outbound message stream, given an application context `Ctx`.
 */
export type WsEffect<Ctx> = (
  in$: Observable<Inbound>,
  ctx: Ctx,
) => Observable<Outbound>;

/**
 * The socket the listener drives. It names no transport: the application
 * adapts its own (`ws`, a browser `WebSocket`, an in-memory pair in a test).
 */
export interface Socket {
  readonly messages$: Observable<Inbound>;
  send(message: Outbound): void;
  readonly closed$: Observable<void>;
}
