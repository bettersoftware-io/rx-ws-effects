import { map, merge, type Observable, of, Subject } from "rxjs";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { combineEffects } from "./combineEffects.js";
import { createWsListener } from "./createWsListener.js";
import { matchType, out } from "./operators.js";
import type { Inbound, Outbound, Socket } from "./types.js";

describe("createWsListener", () => {
  it("sends effect output to the socket", () => {
    const { socket, messages$, sent } = createFakeSocket();
    createWsListener(pingPong, undefined)(socket);
    messages$.next({ type: "ping" });
    expect(sent).toEqual([{ type: "pong" }]);
  });

  it("stops sending after the socket closes", () => {
    const { socket, messages$, closed$, sent } = createFakeSocket();
    createWsListener(pingPong, undefined)(socket);
    messages$.next({ type: "ping" });
    closed$.next();
    messages$.next({ type: "ping" });
    expect(sent).toEqual([{ type: "pong" }]);
  });

  it("subscribes the inbound stream only once across combined effects", () => {
    const messages$ = new Subject<Inbound>();
    const subscribe = vi.spyOn(messages$, "subscribe");
    const closed$ = new Subject<void>();
    const socket: Socket = {
      messages$,
      closed$,
      send: () => {},
    };
    // combineEffects merges two effects → two independent downstream
    // subscriptions to in$. share() collapses them to ONE upstream
    // subscription of socket.messages$ (verified by mutation: removing
    // share() makes this report 2).
    const effect = combineEffects(pingPong, pongPong);
    createWsListener(effect, undefined)(socket);
    messages$.next({ type: "ping" });
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("releases the upstream subscription when the socket closes", () => {
    const { socket, messages$, closed$ } = createFakeSocket();
    createWsListener(combineEffects(pingPong, pongPong), undefined)(socket);
    messages$.next({ type: "ping" });
    expect(messages$.observers.length).toBe(1);
    closed$.next();
    expect(messages$.observers.length).toBe(0);
  });

  it("logs an effect that errors instead of throwing, and leaves other connections working", () => {
    const logged = silenceErrorLog();
    const listen = createWsListener(failOnBoom, undefined);
    const broken = createFakeSocket();
    const healthy = createFakeSocket();
    listen(broken.socket);
    listen(healthy.socket);

    broken.messages$.next({ type: "boom" });
    broken.messages$.next({ type: "ping" });
    healthy.messages$.next({ type: "ping" });

    expect(logged).toHaveBeenCalledTimes(1);
    // The failed connection's effect has stopped; the other one never noticed.
    expect(broken.sent).toEqual([]);
    expect(healthy.sent).toEqual([{ type: "pong" }]);
  });

  it("closes a socket whose effect errored, so the client is not left talking to nothing", () => {
    silenceErrorLog();
    const { socket, messages$ } = createFakeSocket();
    const close = vi.fn();
    createWsListener(failOnBoom, undefined)({ ...socket, close });

    messages$.next({ type: "boom" });

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("ends the connection when send throws, instead of letting the error escape", () => {
    const logged = silenceErrorLog();
    const { socket, messages$ } = createFakeSocket();
    const close = vi.fn();
    const send = vi.fn(() => {
      throw new Error("cannot serialise");
    });
    createWsListener(pingPong, undefined)({ ...socket, send, close });

    // RxJS rethrows an error from a subscriber's `next` on a timer, where
    // nothing can catch it: under Node that ends the process. Fake timers
    // make that rethrow observable here.
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    messages$.next({ type: "ping" });
    messages$.next({ type: "ping" });

    expect(() => {
      vi.runAllTimers();
    }).not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(messages$.observers.length).toBe(0);
  });

  it("ends the connection when the very first send throws, while the effect is still being subscribed", () => {
    silenceErrorLog();
    const { socket, messages$ } = createFakeSocket();
    const close = vi.fn();
    const send = vi.fn(() => {
      throw new Error("cannot serialise");
    });
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });

    createWsListener(greetOnConnect, undefined)({ ...socket, send, close });

    expect(() => {
      vi.runAllTimers();
    }).not.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
    expect(messages$.observers.length).toBe(0);
  });

  it("still ends the connection when closing the socket throws too", () => {
    const logged = silenceErrorLog();
    const { socket, messages$ } = createFakeSocket();
    const close = vi.fn(() => {
      throw new Error("already destroyed");
    });
    createWsListener(failOnBoom, undefined)({ ...socket, close });

    expect(() => {
      messages$.next({ type: "boom" });
    }).not.toThrow();
    expect(logged).toHaveBeenCalledTimes(2);
    expect(messages$.observers.length).toBe(0);
  });
});

function silenceErrorLog(): ReturnType<typeof vi.spyOn> {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});

  onTestFinished(() => {
    logged.mockRestore();
  });

  return logged;
}

function pingPong(in$: Observable<Inbound>): Observable<Outbound> {
  return in$.pipe(
    matchType("ping"),
    map(() => {
      return out("pong");
    }),
  );
}

/** Emits before `subscribe` has returned, then keeps listening. */
function greetOnConnect(in$: Observable<Inbound>): Observable<Outbound> {
  return merge(of(out("hello")), pingPong(in$));
}

function failOnBoom(in$: Observable<Inbound>): Observable<Outbound> {
  return in$.pipe(
    map((message) => {
      if (message.type === "boom") {
        throw new Error("boom");
      }

      return out("pong");
    }),
  );
}

function pongPong(in$: Observable<Inbound>): Observable<Outbound> {
  return in$.pipe(
    matchType("ping"),
    map(() => {
      return out("pong2");
    }),
  );
}

interface FakeSocket {
  socket: Socket;
  messages$: Subject<Inbound>;
  closed$: Subject<void>;
  sent: Outbound[];
}

function createFakeSocket(): FakeSocket {
  const messages$ = new Subject<Inbound>();
  const closed$ = new Subject<void>();
  const sent: Outbound[] = [];
  const socket: Socket = {
    messages$,
    closed$,
    send: (m: Outbound) => {
      sent.push(m);
    },
  };
  return { socket, messages$, closed$, sent };
}
