# Status: pending work

What is not done yet. Finished work is removed from this page, not archived;
the [changelog](CHANGELOG.md) says what shipped.

**Last updated: 2026-10-06**

## Waiting on the owner

- **Publish 0.1.0 to npm.** Nothing is on npm yet. It needs the owner's npm
  login: `npm login`, then `pnpm publish` on `main` (it runs `pnpm check`
  first).

## Waiting on the publish

- **ReactiveTraderCloudClone swaps its workspace copy for this package.**
  Tracked in that repository's `docs/STATUS.md`. pnpm refuses a version
  younger than 24 hours there (`minimumReleaseAge`), so it starts a day after
  the publish, or sooner with an exclusion.
- **The starter in [bettersoftware-io/skills](https://github.com/bettersoftware-io/skills)
  uses this package in its server.** Same wait.

## Dated

- **From 19 October 2026 `ubuntu-latest` means Ubuntu 26.** GitHub's notice:
  [actions/runner-images#14748](https://github.com/actions/runner-images/issues/14748).
  This repository's one workflow, `ci.yml`, uses that label. Decide whether
  to pin a version (`ubuntu-24.04`) or to move with the label, and re-run CI
  once the change lands.

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

- **Releases are made by hand.** There is no release workflow. npm's trusted
  publishing (OIDC from GitHub Actions, no token to store) can only be set up
  once the package exists on npm.
- **The example has no automated test.** `examples/price-server.ts` is
  typechecked against the built package in `pnpm check`, and was run once by
  hand against a real WebSocket client.
