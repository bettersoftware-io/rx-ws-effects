import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  filter,
  groupBy,
  mergeMap,
  type Observable,
  scan,
  switchMap,
} from "rxjs";

import type { Inbound, Outbound, WsEffect } from "./types.js";

export interface KeyedStreamOptions {
  /**
   * Distinct keys this effect will ever track per connection. A key is
   * chosen by the client, so without a cap one socket can hold an unbounded
   * number of `groupBy` groups alive for its whole life, even when every
   * projection is `EMPTY`. Default 128.
   */
  readonly maxKeys?: number;
}

interface KeyState {
  readonly count: number;
  readonly payload: unknown;
}

/**
 * Refcounted, keyed subscription effect — the correct shape for *idempotent*
 * live subscriptions (e.g. prices by symbol).
 *
 * Where `stream()` starts a fresh inner per inbound (`mergeMap`), keyedStream
 * COALESCES frames that share a key: it tracks a per-key refcount, starts the
 * projected stream on the 0→1 transition, and tears it down only when a
 * matching `unsubType` frame brings the count back to 0. A duplicate `subType`
 * while a key is already live is a no-op (count++), so re-subscribing the same
 * key never spawns a second producer — the bug `stream()` would have here: a
 * client that re-subscribes a symbol it never unsubscribed from would get a
 * second price interval merged in, and ticks would speed up with every
 * re-subscribe.
 *
 * Keys are independent and each is error-isolated exactly like `stream()`: an
 * erroring inner logs and completes that one key without killing sibling keys
 * or the effect. `stream()` stays the right tool for a one-shot fan-out, such
 * as a snapshot followed by updates.
 *
 * @param subType   inbound type that opens (or joins) a keyed subscription
 * @param unsubType inbound type that releases one subscriber of a key
 * @param keyOf     extracts the subscription key from a frame's payload
 * @param project   builds the outbound stream for a key (run once per 0→1 edge)
 * @param options   `maxKeys`: the per-connection ceiling on distinct keys
 *
 * Two frames never reach `groupBy`: one whose key is `""` — the contract with
 * `keyOf`, which returns `""` for a payload it cannot read a key from — and
 * one carrying a never-seen key once `maxKeys` distinct keys are already
 * tracked (logged by type and cap only). Frames for a key already seen keep
 * flowing, so a client at the ceiling can still unsubscribe and re-subscribe
 * what it holds.
 */
export function keyedStream<Ctx>(
  subType: string,
  unsubType: string,
  keyOf: (payload: unknown) => string,
  project: (payload: unknown, ctx: Ctx) => Observable<Outbound>,
  options: KeyedStreamOptions = {},
): WsEffect<Ctx> {
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;

  return (in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> => {
    const seen = new Set<string>();

    return in$.pipe(
      filter((msg) => {
        return msg.type === subType || msg.type === unsubType;
      }),
      filter((msg): boolean => {
        const key = keyOf(msg.payload);

        if (key === "") {
          return false;
        }

        if (seen.has(key)) {
          return true;
        }

        if (seen.size >= maxKeys) {
          console.warn(
            `rx-ws-effects: ${subType} key ignored — ${maxKeys} keys already tracked on this connection`,
          );
          return false;
        }

        seen.add(key);
        return true;
      }),
      groupBy((msg) => {
        return keyOf(msg.payload);
      }),
      mergeMap((group$) => {
        return group$.pipe(
          scan(
            (acc: KeyState, msg): KeyState => {
              const delta = msg.type === subType ? 1 : -1;
              return {
                // Clamp at 0 so a stray/duplicate unsubscribe can't drive the
                // count negative and later mask a genuine subscribe.
                count: Math.max(0, acc.count + delta),
                // Retain the latest subscribe payload to feed project().
                payload: msg.type === subType ? msg.payload : acc.payload,
              };
            },
            { count: 0, payload: undefined },
          ),
          distinctUntilChanged((a, b) => {
            return a.count > 0 === b.count > 0;
          }),
          switchMap(({ count, payload }) => {
            return count > 0
              ? project(payload, ctx).pipe(
                  catchError((err: unknown) => {
                    console.error("rx-ws-effects: keyedStream effect error", err);
                    return EMPTY;
                  }),
                )
              : EMPTY;
          }),
        );
      }),
    );
  };
}

/**
 * A legitimate client tracks a few dozen keys per effect; a flood of distinct
 * keys would pin thousands of groups to one socket.
 */
const DEFAULT_MAX_KEYS = 128;
