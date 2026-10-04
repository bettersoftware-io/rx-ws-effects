// A price server in one file: `ws` carries the frames, effects decide what
// they mean.
//
//   pnpm build && node examples/price-server.ts
//
// Then, from any WebSocket client on ws://localhost:4000 :
//
//   {"type":"prices.subscribe","payload":{"symbol":"EURUSD"}}
//   {"type":"prices.unsubscribe","payload":{"symbol":"EURUSD"}}
//   {"type":"time.get","correlationId":"1"}

import {
  combineEffects,
  createWsListener,
  type Inbound,
  keyedStream,
  type Outbound,
  out,
  rpc,
  type Socket,
} from "@better-software/rx-ws-effects";
import { fromEvent, interval, map, Observable, scan, take } from "rxjs";
import { type WebSocket, WebSocketServer } from "ws";

/** What the effects need from the application. A test passes a fake one. */
interface Context {
  prices: (symbol: string) => Observable<number>;
  now: () => number;
}

// A live subscription, one producer per symbol however often a client asks.
const subscribePrices = keyedStream<Context>(
  "prices.subscribe",
  "prices.unsubscribe",
  (payload) => {
    return readSymbol(payload) ?? "";
  },
  (payload, context) => {
    const symbol = readSymbol(payload) ?? "";

    return context.prices(symbol).pipe(
      map((price) => {
        return out("price", { symbol, price });
      }),
    );
  },
);

// A request with one reply, matched to the request by its correlationId.
const getTime = rpc<Context>("time.get", "time", (_payload, context) => {
  return context.now();
});

const listen = createWsListener(combineEffects(subscribePrices, getTime), {
  prices: createRandomWalk,
  now: Date.now,
});

const port = Number(process.env.PORT ?? 4000);
const server = new WebSocketServer({ port });

server.on("connection", (ws) => {
  listen(toSocket(ws));
});

console.info(`price server listening on ws://localhost:${port}`);

/**
 * The adapter from `ws` to the library's `Socket`. It is the application's
 * parse seam: a frame that is not a JSON object with a string `type` is
 * dropped here, so no effect ever sees one.
 */
function toSocket(ws: WebSocket): Socket {
  const messages$ = new Observable<Inbound>((subscriber) => {
    function emitParsedFrame(data: unknown): void {
      const frame = parseFrame(String(data));

      if (frame !== undefined) {
        subscriber.next(frame);
      }
    }

    ws.on("message", emitParsedFrame);

    return () => {
      ws.off("message", emitParsedFrame);
    };
  });

  return {
    messages$,
    closed$: fromEvent(ws, "close").pipe(
      take(1),
      map(() => {
        return undefined;
      }),
    ),
    send: (message: Outbound): void => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
    // The listener calls this when it gives up on the connection, so the
    // client sees it drop instead of waiting on replies that will never come.
    close: (): void => {
      ws.close(1011, "internal error");
    },
  };
}

function parseFrame(text: string): Inbound | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || !("type" in parsed) || typeof parsed.type !== "string") {
    return undefined;
  }

  return parsed as Inbound;
}

function readSymbol(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null || !("symbol" in payload)) {
    return undefined;
  }

  return typeof payload.symbol === "string" ? payload.symbol : undefined;
}

function createRandomWalk(): Observable<number> {
  return interval(500).pipe(
    scan((price) => {
      return Math.round((price + (Math.random() - 0.5) * 0.002) * 100000) / 100000;
    }, 1.1),
  );
}
