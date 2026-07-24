# Contributing to yuque-open-cli

Thanks for your interest in improving the Yuque CLI! This document covers the
development workflow, the conventions the codebase enforces, and how releases
are cut.

> Working with an AI agent (or as one)? [AGENTS.md](./AGENTS.md) is the
> authoritative architecture map and convention guide — it is kept in lockstep
> with the code by tests.

## Development setup

Requirements: Node.js ≥ 20.

```bash
git clone https://github.com/yuque/yuque-open-cli.git
cd yuque-open-cli
npm install
npm run dev -- --help        # run the CLI from source (tsx)
```

To exercise commands against the real API you need a token from
[Yuque Developer Settings](https://www.yuque.com/settings/tokens):

```bash
YUQUE_TOKEN=... npm run dev -- auth status
```

## The check gate

Every change must pass the single unified gate — the same command CI runs:

```bash
npm run check
```

That is: ESLint, Prettier check, generated-types drift check, `tsc`, unit
tests with coverage, build, packaged-CLI smoke test, and the mock-server e2e
suite. If `npm run check` is green locally, CI will be green.

Useful narrower loops while iterating:

```bash
npm test                     # unit tests once
npm run test:watch           # unit tests in watch mode
npm run test:e2e             # build + e2e against the bundled mock server
```

## Spec-driven workflow

The OpenAPI spec is the source of truth for the API surface:

1. Edit `spec/yuque-openapi.yaml` — never edit `src/client/types.gen.ts` by
   hand.
2. Run `npm run gen:types` to regenerate the types.
3. Adapt the thin compatibility layer in `src/client/types.ts` if public type
   names changed.

`npm run gen:types:check` (part of the check gate) fails if the generated
file drifts from the spec. `tests/spec-coverage.test.ts` fails if a spec
operation has no corresponding CLI command, so extending the spec means
extending the command surface in the same change.

## Code layout and conventions

```
bin.ts → cli.ts (commander program, error → exit code)
           └── commands/<domain>.ts   (flags, confirmation, rendering)
                 └── client/api/<domain>.ts  (typed calls, envelope unwrap)
                       └── client/http.ts    (auth header, retry/backoff, YuqueError)
```

- One domain = one `src/commands/<domain>.ts` exporting a single
  `register<Domain>Commands` function, plus one thin `src/client/api/<domain>.ts`.
- `src/client/http.ts` is the only HTTP exit; `src/errors.ts` is the only
  place exit codes are defined.
- Destructive commands must go through `confirmDestructive` (`--yes` to skip).
- Every command supports `--json`; human-readable output goes through the
  helpers in `src/output.ts`.
- The full `--help` surface is pinned by a golden file — when you add or
  change flags, regenerate it as instructed by the failing test and review
  the diff.

## Pull requests

- Branch from `main`; keep PRs focused on one concern.
- Update docs in the same PR: both `README.md` and `README.zh-CN.md` for any
  user-visible change, `AGENTS.md` for structural changes, and `CHANGELOG.md`
  under the upcoming version heading.
- `npm run check` must pass.

## Releasing (maintainers)

Releases are tag-driven via `.github/workflows/release.yml`:

1. Bump `version` in `package.json` and add the matching `## X.Y.Z` section
   at the top of `CHANGELOG.md`; land that on `main`.
2. Tag and push:

   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```

The workflow re-runs the full check gate, publishes to npm with provenance,
and creates the GitHub Release from the CHANGELOG section. It requires the
`NPM_TOKEN` repository secret (an npm automation token with publish rights on
`yuque-open-cli`).

## Reporting security issues

Please do not open public issues for vulnerabilities — see
[SECURITY.md](./SECURITY.md).
