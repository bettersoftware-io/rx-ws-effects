import { share, takeUntil } from "rxjs";

import type { Outbound, Socket, WsEffect } from "./types.js";

/**
 * Wire an effect to sockets. Returns a per-connection handler that pipes the
 * (shared) inbound stream through the effect and out to `socket.send`, tearing
 * the subscription down on `socket.closed$`. Sharing the inbound stream means
 * N effects (after `combineEffects`) still cause only one upstream subscription
 * to `socket.messages$`. A top-level error handler keeps a failed effect
 * from crashing the process: it logs, and that connection's effect stops.
 * This is the last resort, not per-message recovery — `rpc`, `stream`,
 * `keyedStream` and `combineEffects` each catch closer to the failure.
 */
export function createWsListener<Ctx>(
  effect: WsEffect<Ctx>,
  ctx: Ctx,
): (socket: Socket) => void {
  return (socket: Socket): void => {
    const in$ = socket.messages$.pipe(share());
    effect(in$, ctx)
      .pipe(takeUntil(socket.closed$))
      .subscribe({
        next: (message: Outbound) => {
          socket.send(message);
        },
        error: (err: unknown) => {
          console.error("rx-ws-effects: effect stream error", err);
        },
      });
  };
}
