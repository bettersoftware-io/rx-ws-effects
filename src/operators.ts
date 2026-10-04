import { filter, type MonoTypeOperatorFunction } from "rxjs";

import type { Inbound, Outbound } from "./types.js";

/** Build an outbound frame, omitting `correlationId` when absent. */
export function out(
  type: string,
  payload?: unknown,
  correlationId?: string,
): Outbound {
  return correlationId === undefined
    ? { type, payload }
    : { type, payload, correlationId };
}

/** Keep only inbound frames whose `type` matches. */
export function matchType(type: string): MonoTypeOperatorFunction<Inbound> {
  return filter((msg: Inbound): boolean => {
    return msg.type === type;
  });
}
