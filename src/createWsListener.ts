import { share, Subscription, takeUntil } from "rxjs";

import type { Outbound, Socket, WsEffect } from "./types.js";

/**
 * Wire an effect to sockets. Returns a per-connection handler that pipes the
 * (shared) inbound stream through the effect and out to `socket.send`, tearing
 * the subscription down on `socket.closed$`. Sharing the inbound stream means
 * N effects (after `combineEffects`) still cause only one upstream subscription
 * to `socket.messages$`.
 *
 * A failure that reaches the listener ends that connection and nothing else:
 * it is logged, the effect is unsubscribed, and the socket is closed if it can
 * be, so the client sees a dead connection instead of one that answers
 * nothing. Two failures reach it: an error from the effect, and a `send` that
 * throws. This is the last resort, not per-message recovery — `rpc`, `stream`,
 * `keyedStream` and `combineEffects` each catch closer to the failure.
 */
export function createWsListener<Ctx>(
  effect: WsEffect<Ctx>,
  ctx: Ctx,
): (socket: Socket) => void {
  return (socket: Socket): void => {
    // Created first, so a failure during a synchronous first emission already
    // has something to unsubscribe.
    const connection = new Subscription();

    function endConnection(what: string, err: unknown): void {
      console.error(`rx-ws-effects: ${what}`, err);
      connection.unsubscribe();

      try {
        socket.close?.();
      } catch (closeError: unknown) {
        console.error("rx-ws-effects: closing the socket failed", closeError);
      }
    }

    const in$ = socket.messages$.pipe(share());

    connection.add(
      effect(in$, ctx)
        .pipe(takeUntil(socket.closed$))
        .subscribe({
          next: (message: Outbound) => {
            // RxJS rethrows an error from `next` on a timer, where nothing can
            // catch it; under Node that ends the process. So `send` is caught
            // here.
            try {
              socket.send(message);
            } catch (err: unknown) {
              endConnection("send failed", err);
            }
          },
          error: (err: unknown) => {
            endConnection("effect stream error", err);
          },
        }),
    );
  };
}
