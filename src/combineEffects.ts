import { catchError, EMPTY, merge, type Observable } from "rxjs";

import type { Inbound, Outbound, WsEffect } from "./types.js";

/**
 * Merge many effects into one, all sharing the same inbound stream. Each
 * effect is error-isolated: if one errors at its outer level (e.g. an
 * rpc/raw effect, or anything not already caught inside `stream`), it logs
 * and completes without taking down its siblings in the merge. Belt-and-
 * suspenders with `stream`'s own per-inner-stream isolation.
 *
 * Note: a caught effect is replaced by `EMPTY` for the REMAINDER of the
 * connection — it does not resume for later inbound. This last-resort catch
 * should rarely fire: the `stream`, `keyedStream` and `rpc` sugars isolate
 * errors per message internally, so they keep serving after an error. It
 * only permanently disables a hand-written effect that lacks its own
 * per-message catch.
 */
export function combineEffects<Ctx>(
  ...effects: WsEffect<Ctx>[]
): WsEffect<Ctx> {
  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    return merge(
      ...effects.map((effect) => {
        return effect(in$, ctx).pipe(
          catchError((err: unknown) => {
            console.error("rx-ws-effects: effect error (isolated)", err);
            return EMPTY;
          }),
        );
      }),
    );
  };
}
