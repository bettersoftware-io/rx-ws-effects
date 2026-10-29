# Status: pending work

What is not done yet. Finished work is removed from this page, not archived;
the [changelog](CHANGELOG.md) says what shipped.

**Last updated: 2026-10-29**

## Waiting on a release

- **The release workflow has not made a release yet.** Since 2026-10-25 a
  pushed tag stages the version on npm and the owner approves it
  ([RELEASING.md](RELEASING.md)), and npm is set up for it, but for the
  trusted publisher: npm expires one that publishes nothing within two days,
  so it is created on the day of the next release (step 2 there). Not seen
  yet: a version staged by the workflow, whether a staged publish validates
  the trusted publisher, whether `npm stage list` prints the id that
  `approve` takes, and the provenance of a staged version.

## Dated

- **`ubuntu-latest` moves to Ubuntu 26 between 19 October and 19 November
  2026** ([actions/runner-images#14748](https://github.com/actions/runner-images/issues/14748)).
  This repository's one workflow, `ci.yml`, uses that label, and moves with
  it, as decided for the plugin's repositories on 2026-10-16 (their trial on
  `ubuntu-26.04` passed). On 2026-10-24 the runners were still on 24.04. Look
  at the first run after the switch.

## Open decisions

- **Logging.** The library writes to `console.error` and `console.warn`. A
  published library should let the application decide. The shape is open: an
  injected logger, an `onError` callback, or both. Worth settling before 1.0,
  since it changes the signature of `createWsListener` or adds an option to
  every helper.
- **An `rpc` handler that completes without a value sends no reply.** The
  client waits for ever. Replying `nack` would be a behaviour change; decide
  whether it is the right one.

## Not built

- **The example has no automated test.** `examples/price-server.ts` is
  typechecked against the built package in `pnpm check`, and was run once by
  hand against a real WebSocket client.
