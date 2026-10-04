# Changelog

## 0.1.0

First release. The code is `packages/ws-effects` from
[ReactiveTraderCloudClone](https://github.com/bettersoftware-io/ReactiveTraderCloudClone)
at commit `5f2c38f9e`, with the changes below.

### Behaviour

- **A `send` that throws no longer escapes.** RxJS rethrows an error from a
  subscriber's `next` on a timer, where nothing can catch it; under Node that
  ends the process. `createWsListener` now catches it, logs it and ends that
  connection.
- **A connection the listener gives up on is closed**, when the socket has the
  new optional `close()`. Before, it stayed open and answered nothing.
- **`rpc` has a ceiling**, like `stream` and `keyedStream`: `{ maxActive }`,
  default 64 requests in flight per connection. A request over it is nacked.

### Packaging

- `rxjs` is a peer dependency instead of a dependency, so the library and the
  application share one copy.
- Log lines are prefixed `rx-ws-effects:` instead of `ws-effects:`.
- Comments no longer refer to the application the code came from.
