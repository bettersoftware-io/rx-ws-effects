import { catchError, EMPTY, finalize, mergeMap, type Observable } from "rxjs";

import { matchType } from "./operators.js";
import type { Inbound, Outbound, WsEffect } from "./types.js";

export interface StreamOptions {
  /**
   * Live inner streams this effect may hold per connection before further
   * matching frames are dropped. Default 64.
   */
  readonly maxActive?: number;
}

/**
 * Sugar for a subscription effect: on each matching inbound, subscribe the
 * projected observable and forward its outbound frames. `project` returns
 * `Outbound`s directly, so it covers 1→N streaming and a snapshot followed by
 * updates. Each projected inner stream is error-isolated: if it errors, that
 * one inner stream logs and completes without killing the effect or any other
 * matching inbound's inner stream.
 *
 * The effect is invoked once per connection, so `maxActive` is a
 * per-connection ceiling: a matching frame that arrives while that many inner
 * streams are still live is dropped (logged by type and cap only), and the
 * slot is handed back when an inner completes, errors or is unsubscribed.
 */
export function stream<Ctx>(
  inType: string,
  project: (payload: unknown, ctx: Ctx) => Observable<Outbound>,
  options: StreamOptions = {},
): WsEffect<Ctx> {
  const maxActive = options.maxActive ?? DEFAULT_MAX_ACTIVE;

  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    let active = 0;

    return in$.pipe(
      matchType(inType),
      mergeMap((msg): Observable<Outbound> => {
        if (active >= maxActive) {
          console.warn(
            `rx-ws-effects: ${inType} dropped — ${maxActive} streams already live on this connection`,
          );
          return EMPTY;
        }

        active += 1;

        return project(msg.payload, ctx).pipe(
          catchError((err: unknown) => {
            console.error("rx-ws-effects: stream effect error", err);
            return EMPTY;
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
 * A legitimate client holds a handful of inner streams per effect (one per
 * subscribed symbol, say); a flood of subscribe frames would hold thousands,
 * each a live producer.
 */
const DEFAULT_MAX_ACTIVE = 64;
