import {
  catchError,
  defer,
  finalize,
  from,
  isObservable,
  map,
  mergeMap,
  type Observable,
  of,
  take,
} from "rxjs";

import { matchType, out } from "./operators.js";
import type { Inbound, Outbound, WsEffect } from "./types.js";

function toObservable(
  value: Observable<unknown> | Promise<unknown> | unknown,
): Observable<unknown> {
  if (isObservable(value)) {
    return value;
  }

  if (value instanceof Promise) {
    return from(value);
  }

  const result: Observable<unknown> = of(value);
  return result;
}

export interface RpcOptions {
  /**
   * Requests this effect may have in flight per connection before further
   * ones are nacked. Default 64.
   */
  readonly maxActive?: number;
}

/**
 * Sugar for a request/response effect. Runs `handle` per matching inbound,
 * takes its first emission as the result, and replies with an ack (or nack on
 * error), threading the request's correlationId. Absorbs the try/ack/catch/nack
 * boilerplate. A handler that throws synchronously is nacked too, not just
 * one whose observable/promise fails.
 *
 * The effect is invoked once per connection, so `maxActive` is a
 * per-connection ceiling: a request that arrives while that many are still
 * waiting on their handler is nacked at once (logged by type and cap only),
 * and the slot is handed back when a handler emits, fails or is unsubscribed.
 * Without it, a client could hold an unbounded number of slow handlers open.
 *
 * Known limit: if `handle`'s source completes without emitting, no reply is
 * sent (where `firstValueFrom` would reject, and so nack). A handler must
 * emit once, or throw.
 */
export function rpc<Ctx>(
  inType: string,
  outType: string,
  handle: (
    payload: unknown,
    ctx: Ctx,
  ) => Observable<unknown> | Promise<unknown> | unknown,
  options: RpcOptions = {},
): WsEffect<Ctx> {
  const maxActive = options.maxActive ?? DEFAULT_MAX_ACTIVE;

  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    let active = 0;

    return in$.pipe(
      matchType(inType),
      mergeMap((msg) => {
        if (active >= maxActive) {
          console.warn(
            `rx-ws-effects: ${inType} refused — ${maxActive} requests already in flight on this connection`,
          );
          return of(out(outType, { type: "nack" }, msg.correlationId));
        }

        active += 1;

        // `defer` moves the `handle` call inside the inner stream: a handler
        // that throws synchronously (a payload guard, say) then errors the
        // inner and is nacked below, instead of erroring the outer stream and
        // taking the whole effect down for the rest of the connection.
        return defer(() => {
          return toObservable(handle(msg.payload, ctx));
        }).pipe(
          take(1),
          map((result) => {
            return out(
              outType,
              { type: "ack", payload: result },
              msg.correlationId,
            );
          }),
          catchError(() => {
            return of(out(outType, { type: "nack" }, msg.correlationId));
          }),
          finalize(() => {
            active -= 1;
          }),
        );
      }),
    );
  };
}

/**
 * A legitimate client has a handful of requests waiting at once; a flood of
 * requests to a slow handler would hold thousands open.
 */
const DEFAULT_MAX_ACTIVE = 64;
