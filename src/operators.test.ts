import { type Observable, of } from "rxjs";
import { toArray } from "rxjs/operators";
import { describe, expect, it } from "vitest";

import { matchType, out } from "./operators.js";
import type { Inbound } from "./types.js";

describe("out", () => {
  it("omits correlationId when not supplied", () => {
    expect(out("stream.priceTick", { bid: 1 })).toEqual({
      type: "stream.priceTick",
      payload: { bid: 1 },
    });
  });

  it("includes correlationId when supplied", () => {
    expect(out("rpc.x.response", { type: "ack" }, "42")).toEqual({
      type: "rpc.x.response",
      payload: { type: "ack" },
      correlationId: "42",
    });
  });
});

describe("matchType", () => {
  it("keeps only messages of the given type", async () => {
    const in$: Observable<Inbound> = of(
      { type: "a", payload: 1 },
      { type: "b", payload: 2 },
      { type: "a", payload: 3 },
    );

    const kept = await new Promise((resolve) => {
      in$.pipe(matchType("a"), toArray()).subscribe(resolve);
    });
    expect(kept).toEqual([
      { type: "a", payload: 1 },
      { type: "a", payload: 3 },
    ]);
  });
});
