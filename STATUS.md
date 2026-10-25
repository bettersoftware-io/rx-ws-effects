# Status: pending work

What is not done yet. Finished work is removed from this page, not archived;
the [changelog](CHANGELOG.md) says what shipped.

**Last updated: 2026-10-25**

## Waiting on the owner

- **The `0.0.0-stage` version on npm.** npm wrote it as a placeholder, two
  files and no code (`"stub": true`), a minute before 0.1.0 on 2026-10-25.
  `latest` is 0.1.0, so an install takes 0.1.0, but the stub stays listed.
  `npm deprecate @better-software/rx-ws-effects@0.0.0-stage "a placeholder, not a release"`
  says so to anyone who asks for it by name.
- **Trusted publishing.** 0.1.0 was published by hand from a laptop. The
  release workflow is written (`.github/workflows/release.yml`: a pushed
  `v*` tag that names `package.json`'s version, on a commit on `main`, is
  published with provenance and no stored token). npm accepts it once the
  package has a trusted publisher: on npmjs.com, the package's Settings,
  Trusted Publisher, GitHub Actions, with `bettersoftware-io`,
  `rx-ws-effects`, `release.yml` and the environment `npm`. Then, under
  Publishing access, "Require two-factor authentication and disallow
  tokens" leaves the workflow as the only way to publish. Until then a tag
  fails its Publish step and publishes nothing.

## Waiting on the release age

0.1.0 was published on 2026-10-25 at 13:05 UTC (tag `v0.1.0`, commit
`87e7c44`; the tarball is that commit's `pnpm pack`, file for file). pnpm
refuses a version younger than 24 hours in both projects below
(`minimumReleaseAge`), so each can start from 2026-10-26, 13:05 UTC.

- **ReactiveTraderCloudClone swaps its workspace copy for this package.**
  Tracked in that repository's `docs/STATUS.md`.
- **The starter in [bettersoftware-io/skills](https://github.com/bettersoftware-io/skills)
  uses this package in its server.** Tracked in that repository's
  `docs/STATUS.md`.

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
