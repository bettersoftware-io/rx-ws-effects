import { map, type Observable, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import { combineEffects } from "./combineEffects.js";
import { matchType, out } from "./operators.js";
import type { Inbound, Outbound } from "./types.js";

describe("combineEffects", () => {
  it("merges outputs of all effects over one inbound stream", () => {
    // A hot Subject (not a cold `of(...)`) so each effect's independent
    // subscription observes the same live emissions in the same order —
    // this is what a real shared inbound stream (e.g. a socket's
    // `messages$`) behaves like, and is what `merge` actually interleaves.
    const in$ = new Subject<Inbound>();
    const combined = combineEffects(echoA, echoB);
    const outs: Outbound[] = [];
    combined(in$, undefined).subscribe((frame) => {
      outs.push(frame);
    });

    in$.next({ type: "a" });
    in$.next({ type: "b" });
    in$.next({ type: "a" });
    in$.complete();

    expect(outs).toEqual([{ type: "A" }, { type: "B" }, { type: "A" }]);
  });

  it("isolates an erroring effect: a sibling effect keeps emitting and the merge does not error", () => {
    const in$ = new Subject<Inbound>();
    const combined = combineEffects(explodingEffect, echoB);
    const outs: Outbound[] = [];
    let errored = false;
    combined(in$, undefined).subscribe({
      next: (frame: Outbound) => {
        outs.push(frame);
      },
      error: () => {
        errored = true;
      },
    });

    in$.next({ type: "b" });
    in$.complete();

    expect(errored).toBe(false);
    expect(outs).toEqual([{ type: "B" }]);
  });
});

function echoA(in$: Observable<Inbound>): Observable<Outbound> {
  return in$.pipe(
    matchType("a"),
    map(() => {
      return out("A");
    }),
  );
}

function echoB(in$: Observable<Inbound>): Observable<Outbound> {
  return in$.pipe(
    matchType("b"),
    map(() => {
      return out("B");
    }),
  );
}

function explodingEffect(): Observable<Outbound> {
  return throwError(() => {
    return new Error("boom");
  });
}
