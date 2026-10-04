import { map, of, Subject, throwError } from "rxjs";
import { TestScheduler } from "rxjs/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { out } from "./operators.js";
import { stream } from "./stream.js";
import type { Inbound, Outbound } from "./types.js";

describe("stream", () => {
  beforeEach(() => {
    scheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it("projects each matching inbound into its outbound stream", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      // project: for a subscribe.pricing message, emit two ticks then keep going
      const ticks$ = cold("x-y|", { x: out("tick", 1), y: out("tick", 2) });
      const effect = stream<unknown>("subscribe.pricing", () => {
        return ticks$;
      });

      const in$ = hot("  a---", {
        a: { type: "subscribe.pricing" } as Inbound,
      });
      const expected = " x-y";
      expectObservable(effect(in$, undefined)).toBe(expected, {
        x: out("tick", 1) as Outbound,
        y: out("tick", 2) as Outbound,
      });
    });
  });

  it("keeps each matching inbound's inner stream alive concurrently (mergeMap, not switch/concat)", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      // Each inner emits over several frames; the two inbounds overlap in time.
      // mergeMap interleaves both inners → "ab-ab".
      // switchMap would cancel `a`'s inner when `b` arrives → "ab--b".
      // concatMap would defer `b`'s inner until `a`'s completes → "a--ab--b".
      const effect = stream<unknown>("subscribe.pricing", (payload) => {
        return cold("x--x|", { x: out("tick", payload) });
      });

      const in$ = hot("ab", {
        a: { type: "subscribe.pricing", payload: "a" } as Inbound,
        b: { type: "subscribe.pricing", payload: "b" } as Inbound,
      });
      const expected = "ab-ab";
      expectObservable(effect(in$, undefined)).toBe(expected, {
        a: out("tick", "a") as Outbound,
        b: out("tick", "b") as Outbound,
      });
    });
  });

  it("isolates an erroring inner stream: a later matching inbound still produces output", () => {
    const in$ = new Subject<Inbound>();
    let calls = 0;
    const effect = stream<unknown>("subscribe.pricing", () => {
      calls += 1;
      return calls === 1
        ? throwError(() => {
            return new Error("boom");
          })
        : of(out("tick", "second"));
    });
    const outs: Outbound[] = [];
    let errored = false;
    effect(in$, undefined).subscribe({
      next: (frame: Outbound) => {
        outs.push(frame);
      },
      error: () => {
        errored = true;
      },
    });

    in$.next({ type: "subscribe.pricing" });
    in$.next({ type: "subscribe.pricing" });

    expect(errored).toBe(false);
    expect(outs).toEqual([out("tick", "second")]);
  });

  it("ignores non-matching inbound", () => {
    scheduler.run(({ cold, hot, expectObservable }) => {
      const effect = stream<unknown>("subscribe.pricing", () => {
        return cold("x|", { x: out("tick", 1) });
      });
      const in$ = hot("b|", { b: { type: "subscribe.other" } as Inbound });
      expectObservable(
        effect(in$, undefined).pipe(
          map((m) => {
            return m;
          }),
        ),
      ).toBe("-|");
    });
  });

  it("drops a matching inbound once maxActive inner streams are live, and accepts again when one completes", () => {
    const inners: Subject<Outbound>[] = [];
    const effect = stream<unknown>(
      "subscribe.x",
      () => {
        const inner = new Subject<Outbound>();
        inners.push(inner);
        return inner;
      },
      { maxActive: 2 },
    );
    const in$ = new Subject<Inbound>();
    const outs: Outbound[] = [];
    effect(in$, undefined).subscribe((frame: Outbound) => {
      outs.push(frame);
    });

    in$.next({ type: "subscribe.x" });
    in$.next({ type: "subscribe.x" });
    in$.next({ type: "subscribe.x" });
    expect(inners).toHaveLength(2);

    inners[0]?.complete();
    in$.next({ type: "subscribe.x" });
    expect(inners).toHaveLength(3);

    inners[2]?.next(out("tick", 3));
    expect(outs).toEqual([out("tick", 3)]);
  });

  let scheduler: TestScheduler;
});
