# rx-ws-effects

Declarative WebSocket message handling on RxJS.

A server's message handling is written as data flow instead of a `switch`.
Each **effect** is a pure function from the stream of incoming messages to a
stream of outgoing ones:

```ts
type WsEffect<Ctx> = (in$: Observable<Inbound>, ctx: Ctx) => Observable<Outbound>;
```

The library is small (about 400 lines, comments included), depends only on
`rxjs`, and names no transport. Because an effect never touches a socket, the
code that runs a real server also runs a simulated backend inside a browser or
a test.

```bash
pnpm add @better-software/rx-ws-effects rxjs
```

`rxjs` 7.8 or later is a peer dependency. The package is ESM only.

## A server in three steps

**1. Write effects.** Two helpers cover most of them.

```ts
import { keyedStream, out, rpc } from "@better-software/rx-ws-effects";
import { map } from "rxjs";

// A live subscription: one producer per symbol, however often a client asks.
const subscribePrices = keyedStream<Context>(
  "prices.subscribe",
  "prices.unsubscribe",
  (payload) => readSymbol(payload) ?? "",
  (payload, context) => {
    const symbol = readSymbol(payload) ?? "";

    return context.prices(symbol).pipe(map((price) => out("price", { symbol, price })));
  },
);

// A request with one reply, matched to the request by its correlationId.
const getTime = rpc<Context>("time.get", "time", (_payload, context) => context.now());
```

**2. Combine them and give them a context.** The context is whatever the
effects need from your application: services, simulators, a clock.

```ts
import { combineEffects, createWsListener } from "@better-software/rx-ws-effects";

const listen = createWsListener(combineEffects(subscribePrices, getTime), {
  prices: createRandomWalk,
  now: Date.now,
});
```

**3. Hand it each connection.** `listen` takes a `Socket`: a stream of parsed
messages, a `send`, a stream that fires on close, and optionally a `close`.
You adapt your transport to it.

```ts
new WebSocketServer({ port: 4000 }).on("connection", (ws) => {
  listen(toSocket(ws));
});
```

[`examples/price-server.ts`](examples/price-server.ts) is this server in full,
including a `toSocket` adapter for [`ws`](https://github.com/websockets/ws).

## What is in the box

| Export | What it is for |
|---|---|
| `WsEffect<Ctx>` | The one primitive. Anything of this shape is an effect; the helpers below only save typing |
| `rpc(inType, outType, handle)` | Request and reply. Replies `{ type: "ack", payload }` with the handler's first value, or `{ type: "nack" }` if it throws, fails or is refused, on the request's `correlationId` |
| `stream(inType, project)` | One message starts one stream of replies: a snapshot followed by updates, a one-off fan-out |
| `keyedStream(subType, unsubType, keyOf, project)` | A live subscription that a client can repeat and cancel. Messages with the same key share one producer, counted in and out |
| `combineEffects(...effects)` | Merges effects over one shared inbound stream |
| `createWsListener(effect, ctx)` | Returns the per-connection handler. Subscribes the inbound stream once, and unsubscribes everything when the socket closes |
| `matchType(type)`, `out(type, payload?, correlationId?)` | The two small pieces hand-written effects are made of |

The message shape is fixed: `{ type: string, payload?: unknown, correlationId?: string }`
in both directions. Payloads are `unknown` on the way in, so each effect
validates what it reads.

### `stream` or `keyedStream`?

`stream` starts a new producer for every matching message. That is right for
a one-off request, and wrong for a subscription a client may send twice: the
second message starts a second producer and the client receives everything
double. `keyedStream` is for those. It starts the producer when a key's count
goes from 0 to 1 and stops it when an unsubscribe brings the count back to 0.

## One failure does not take the rest down

Errors are caught at four levels, closest to the failure first:

| Level | What happens |
|---|---|
| One reply stream (`stream`, `keyedStream`) | It is logged and ends. The effect keeps serving other messages and other keys |
| One request (`rpc`) | The client gets a `nack` on the same `correlationId`. A handler that throws synchronously is caught the same way |
| One effect (`combineEffects`) | It is logged and stops for the rest of that connection. Its sibling effects carry on |
| One connection (`createWsListener`) | An effect error that got this far, or a `send` that throws, is logged and ends that connection: its effects are unsubscribed and the socket is closed, if the adapter gave it a `close`. The process, and every other connection, carries on |

Give your adapter a `close`. Without one, a connection whose effects have
stopped stays open and answers nothing; with one, the client sees it drop and
can reconnect.

## Limits a client cannot exceed

A client chooses how much it asks for, so every helper has a ceiling per
connection. A message over the ceiling is logged and refused: a subscription
is dropped, a request is nacked.

| Option | Default | Caps |
|---|---|---|
| `rpc(…, { maxActive })` | 64 | Requests still waiting on their handler |
| `stream(…, { maxActive })` | 64 | Reply streams live at once for that effect |
| `keyedStream(…, { maxKeys })` | 128 | Distinct keys that effect will ever track |

Rate limiting, authentication and frame size belong to your transport adapter:
they need the socket, and an effect never sees it.

## The same effects, without a network

Nothing in an effect knows about sockets, so an in-memory `Socket` runs the
same server inside a test or a browser tab:

```ts
import { Subject } from "rxjs";

const messages$ = new Subject<Inbound>();
const closed$ = new Subject<void>();
const sent: Outbound[] = [];

listen({
  messages$,
  closed$,
  send: (message) => {
    sent.push(message);
  },
});

messages$.next({ type: "time.get", correlationId: "1" });
// sent: [{ type: "time", payload: { type: "ack", payload: 1791129221907 }, correlationId: "1" }]
```

Effects are plain stream transforms, so they can also be tested on their own
with RxJS marble diagrams. This repository's tests do.

## Known limits

- **Logging goes to `console`.** Errors use `console.error` and dropped
  messages use `console.warn`, each prefixed `rx-ws-effects:`. There is no
  logger option yet.
- **An `rpc` handler that completes without a value sends no reply.** A
  handler must emit once, or throw.
- **An effect stopped by `combineEffects` stays stopped** until the client
  reconnects. The helpers catch per message, so this only reaches a
  hand-written effect with no `catchError` of its own.

## Developing

Node 24 or later and pnpm.

```bash
pnpm install
pnpm test
pnpm check      # typecheck, tests with coverage, build, and the package checks
```

`pnpm check` ends by packing the tarball, installing it into an empty project
and using it by name, under Node's resolver and under TypeScript's. That is the
check that the published files work, not just the source.

## Where it came from

Extracted from
[ReactiveTraderCloudClone](https://github.com/bettersoftware-io/ReactiveTraderCloudClone),
where it replaced a server's message `switch`. The shape is a homage to
[Marble.js](https://github.com/marblejs/marble) effects, written from scratch.

## Licence

MIT
