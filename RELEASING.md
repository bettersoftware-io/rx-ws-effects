# Releasing

How a version of `@better-software/rx-ws-effects` reaches npm: what is set
up, what was decided and why, and the steps for a new version.

In short: a pushed tag makes the Release workflow **stage** the version on
npm. A staged version is uploaded but cannot be installed. The owner then
**approves** it from a terminal with their second factor, and that publishes
it.

## What is set up

As of 2026-10-25.

| Where | What | State |
|---|---|---|
| npm | `0.1.0`, the first release, `latest` | Published by hand from a laptop on 2026-10-25 at 13:05 UTC. Tag `v0.1.0`, commit `87e7c44`; the tarball is that commit's `pnpm pack`, file for file. No provenance: a publish by hand has none |
| npm | `0.0.0-stage` | A placeholder npm wrote a minute before 0.1.0: two files, no code. Deprecated with "a placeholder, not a release", so anyone who asks for it by name is told. An install takes `latest` and never sees it |
| npm, the package's Settings, Publishing access | "Require two-factor authentication and disallow bypass 2fa tokens" | On |
| npm, the package's Settings, Trusted Publisher | GitHub Actions, `bettersoftware-io/rx-ws-effects`, `release.yml`, environment `npm`, "Allow npm publish" unticked | **Not kept.** One was created on 2026-10-25 and expires unused on 2026-10-27 (see the two-day rule). It is created again on the day of the next release |
| This repository | [`.github/workflows/release.yml`](.github/workflows/release.yml) | On `main`. It runs on a pushed `v*` tag |
| This repository | The environment `npm` | GitHub creates it on the workflow's first run, with no protection rule |

## Decisions, and why

### The release is made by a workflow, with trusted publishing

npm's trusted publishing lets a GitHub Actions job prove which repository and
which workflow file it is, with a short-lived OIDC token that GitHub issues
for that one run. npm exchanges it for the right to publish this package, and
for nothing else.

- **No npm token is stored**, so there is no secret to leak, to rotate or to
  forget. A token that leaks, in a CI log, a dotfile or a compromised machine,
  is the usual way a package is taken over.
- **The release carries provenance:** npm links it to the commit and the
  workflow run that built it, and shows that on the package's page. A publish
  by hand has none.
- **The same checks every time.** The workflow runs `pnpm check`, the command
  a person runs before publishing, on a clean machine.

npm needs version 11.5.1 or later for trusted publishing. Node 24, which the
workflow uses, ships npm 11.19.1, which has it and has `npm stage`.

### The workflow stages; the owner publishes

On the trusted publisher, "Allow npm publish" is left unticked, as npm
recommends ("For stronger security, leave this unchecked to require staged
publishing for new versions"). The workflow may then only run
`npm stage publish`, and the version waits on npm until the owner approves it.

| | "Allow npm publish" ticked | Left unticked (chosen) |
|---|---|---|
| A pushed tag | publishes at once | stages: the version is on npm and cannot be installed |
| The owner, per release | nothing | one command, `npm stage approve <id>`, with their second factor |
| Someone who takes over the workflow or the GitHub account | can publish a malicious version | can only stage one, which goes nowhere |

The package is released rarely and by one person, so one approval a release
costs little, and a version never reaches an install without the owner.

### No token publishes without a second factor

Publishing access is "Require two-factor authentication and disallow bypass
2fa tokens". npm's alternative, "Require two-factor authentication or a
granular access token with bypass 2fa enabled", would let such a token publish
with nobody present. With the setting chosen, what can still put a version on
npm is:

- the Release workflow, which can only stage, and
- the owner in person, with their second factor: approving a staged version,
  or publishing by hand.

The setting does not affect trusted publishing, which uses no stored token.

### A tag publishes nothing it should not

The workflow stops before it builds when the tag names a version other than
`package.json`'s (`v0.2.0` against `"version": "0.2.1"`), or when the tagged
commit is not on `main`. A tag pushed by mistake, or on a branch, stages
nothing.

### `pnpm check` is a step of its own

A publish by hand runs `pnpm check` through `prepublishOnly`. npm does not say
whether `npm stage publish` runs that script, so the workflow runs the check as
a step before staging. If staging runs it too, it runs twice, which costs a
minute and changes nothing.

### The trusted publisher is created on the day of a release: the two-day rule

npm validates a new trusted publisher by its first successful publish, which
binds it to the repository for good. **If nothing publishes within two days of
its creation, it expires:** it can no longer be used or edited, and the only
way on is to delete it and create a new one, with a new two days.

So it is created when a release is ready, and the tag is pushed the same day.
One was created on 2026-10-25 with nothing to release; it was left to expire
on 2026-10-27 rather than validated with a version that changes nothing. A
version is published to everyone who installs the package, so it is not spent
on a test.

npm's documents do not say whether a staged publish counts as that first
publish. The npm page showed the new trusted publisher as "Permissions: npm
stage publish" and "Publish once before … to validate", which suggests it
does. The first release by the workflow will show it (see "Not seen yet").

### The environment `npm`

The job runs in the GitHub environment `npm`, and the trusted publisher names
it. A run outside that environment is refused by npm, and a protection rule (a
required reviewer, a wait) can be added to the environment later without
touching npm.

## Publishing a new version

You need: push access to this repository, the npm account that owns the
package, and its second factor.

### 1. Merge the version

On a branch, as any change:

1. Set the new version in `package.json`. Before 1.0, a change that breaks
   the API moves the minor version (`0.1.0` to `0.2.0`), anything else the
   patch version.
2. Add its section at the top of `CHANGELOG.md`, in the form of the ones
   below it.
3. Open the pull request, wait for CI to pass, and merge it.

### 2. Create the trusted publisher

Skip this step when the package's Settings already show a trusted publisher
that is validated, not "Pending validation" or expired.

1. On npmjs.com, open the package, then **Settings**.
2. Under **Trusted Publisher**, delete an expired one if it is there. Then, at
   "Select your publisher", click **GitHub Actions**.
3. Enter, exactly (every field is case-sensitive):

   | Field | Value |
   |---|---|
   | Organization or user | `bettersoftware-io` |
   | Repository | `rx-ws-effects` |
   | Workflow filename | `release.yml` |
   | Environment name | `npm` |

4. Leave **Allow npm publish** unticked, and leave dist-tag access off.
5. Save. npm checks nothing on save: a mistake shows only when the workflow
   stages.

From here the clock runs: push the tag within two days.

### 3. Tag the merged commit and push the tag

From a checkout of this repository:

```bash
git fetch origin
git show origin/main:package.json | grep '"version"'   # the version you merged
git tag v0.2.0 origin/main
git push origin v0.2.0
```

The tag is `v` and the version, and it goes on `origin/main`, the commit that
holds the new `package.json`.

### 4. Watch the Release workflow

In the repository's Actions tab, or with `gh run watch`. It takes a few
minutes. When it fails:

| The step that failed | Why | What to do |
|---|---|---|
| "The tag names package.json's version, on main" | The tag and `package.json` disagree, or the commit is not on `main` | Nothing was staged. Delete the tag (`git push origin :refs/tags/v0.2.0`, then `git tag -d v0.2.0`) and tag the right commit |
| "Typecheck, tests with coverage, build, package checks" | `pnpm check` fails on a clean machine | Nothing was staged. Fix it on `main`, then move the tag as above |
| "Stage the release" | npm refused: no trusted publisher, an expired one, or one whose fields do not match | Nothing was staged. Correct the trusted publisher (step 2), then re-run the job from the Actions tab |

### 5. Approve the staged version

From a terminal, logged in to npm (`npm whoami` says who; `npm login` if
nobody):

```bash
npm stage list @better-software/rx-ws-effects    # the staged version and its id
npm stage download <id>                          # optional: the tarball, to look at
npm stage approve <id>                           # asks for your second factor, then publishes
```

To throw a staged version away instead: `npm stage reject <id>`. Whether its
version number can be staged again afterwards is not known.

### 6. Check it

```bash
npm view @better-software/rx-ws-effects version dist-tags
```

`latest` is the new version, and the package's page on npmjs.com shows its
provenance. On the package's Settings, the trusted publisher is now
validated, so the next release skips step 2.

Projects that install the package wait a while before they take it: pnpm
refuses a version younger than a day where `minimumReleaseAge` is set, and
Renovate waits seven days.

## By hand, when the workflow cannot

A maintainer can still publish from a laptop, as 0.1.0 was: on a clean
checkout of the tagged commit, `npm publish`. `prepublishOnly` runs
`pnpm check` first, and npm asks for the second factor. That version has no
provenance, so use it only when the workflow cannot run.

## Not seen yet

- A version staged by the workflow. Until one is, the release steps above are
  as npm's documents describe them, not as they were watched.
- Whether a staged publish validates a new trusted publisher.
- Whether `npm stage list` prints the id that `approve` takes.
- The provenance of a staged version on the package's page.
