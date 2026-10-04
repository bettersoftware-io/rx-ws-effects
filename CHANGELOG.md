# Changelog

## 0.1.0

First release. The code is `packages/ws-effects` from
[ReactiveTraderCloudClone](https://github.com/bettersoftware-io/ReactiveTraderCloudClone)
at commit `5f2c38f9e`, with these changes:

- `rxjs` is a peer dependency instead of a dependency, so the library and the
  application share one copy.
- Log lines are prefixed `rx-ws-effects:` instead of `ws-effects:`.
- A test for `createWsListener`'s error handler, the one line the original
  tests did not reach.
- Comments no longer refer to the application the code came from.

No behaviour changed.
