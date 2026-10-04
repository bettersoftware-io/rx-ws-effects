# rx-ws-effects

A small declarative effects framework for WebSocket servers, built on RxJS.

A server's message handling is written as data flow instead of a `switch`:
each effect is a pure function from a stream of incoming messages to a stream
of outgoing ones.

```ts
type WsEffect<Ctx> = (in$: Observable<Inbound>, ctx: Ctx) => Observable<Outbound>;
```

Because effects are pure stream transforms, the same code that runs a real
server can drive a simulated backend inside a browser or a test.

## Status

Not published yet. The code currently lives in
[ReactiveTraderCloudClone](https://github.com/bettersoftware-io/ReactiveTraderCloudClone)
as `packages/ws-effects` and will be extracted here, then published to npm as
`@better-software/rx-ws-effects`.

Its only runtime dependency is `rxjs`.

## Licence

MIT
