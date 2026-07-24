# AGENTS.md

Guidance for AI agents (and humans) working in this repo.

## What this is

`yuque-open-cli` — a command-line interface for the Yuque (语雀) Open API, sibling of
[yuque-mcp-server](https://github.com/yuque/yuque-mcp-server) and built with the same
engineering conventions.

## Architecture

```
bin.ts → cli.ts (commander program, error → exit code)
           └── commands/<domain>.ts   (flags, confirmation, rendering)
                 └── client/api/<domain>.ts  (typed calls, envelope unwrap)
                       └── client/http.ts    (auth header, retry/backoff, YuqueError)
```

## Map

- `src/bin.ts` — process entry point; installs quiet `EPIPE` handling and assigns `process.exitCode` from `runCli`.
- `src/cli.ts` — owns `buildProgram`, global options, domain registration, and the single `runCli` error-to-exit-code mapping.
- `src/config.ts` — resolves token (`--token` > `YUQUE_TOKEN` > `YUQUE_PERSONAL_TOKEN`), host (`--host` > `YUQUE_HOST` > default), and timeout (`--timeout` > `YUQUE_TIMEOUT_MS` > 30000); `normalizeHost` strips trailing slashes and `/api/v2`.
- `src/context.ts` — `getContext` builds the per-action HTTP/output context; call it only inside actions so `--help` never requires a token.
- `src/errors.ts` — sole definition of CLI error classes, API status hints, and the stable exit-code contract.
- `src/output.ts` — `printJson`/`printOk`/`printTable`/`printRecord`, TTY color honoring `NO_COLOR`, and CJK/emoji display-width alignment.
- `src/confirm.ts` — `confirmDestructive` enforces the interactive confirmation or `--yes` gate for destructive actions.
- `src/commands/` — Commander-facing domain modules; each exports one `register<Domain>Commands` function and owns flags, action orchestration, and rendering.
- `src/commands/auth.ts` — `registerAuthCommands` registers connectivity and authenticated-account status commands.
- `src/commands/book.ts` — `registerBookCommands` registers book list/get/create/update/delete, pagination, validation, and delete confirmation.
- `src/commands/doc.ts` — `registerDocCommands` registers document CRUD, body/file handling, pagination, and version reads.
- `src/commands/group.ts` — `registerGroupCommands` registers group-member list/set/remove, pagination, roles, and removal confirmation.
- `src/commands/note.ts` — `registerNoteCommands` registers note list/get/create/update, `has_more` pagination, file-backed content, and note rendering.
- `src/commands/resource.ts` — `registerResourceCommands` registers structured-board get/create/update, locator validation, and text/JSON DSL handling.
- `src/commands/search.ts` — `registerSearchCommands` registers typed doc/book search and maps the book surface name to the API's `repo` value.
- `src/commands/stats.ts` — `registerStatsCommands` registers aggregate/member/book/doc statistics, filters, sorting, and page draining.
- `src/commands/toc.ts` — `registerTocCommands` registers TOC tree reads and cross-field-validated node updates.
- `src/commands/user.ts` — `registerUserCommands` registers current-user and user-group reads with role filtering and pagination.
- `src/client/http.ts` — the only HTTP exit; adds auth/base URL/timeout, normalizes errors, retries 429 for every method, and retries 502/503/504 or network failures only for GET.
- `src/client/api/` — thin domain wrappers: `YuqueHttp` is the first argument, typed `ApiEnvelope` responses are awaited, and `res.data` is returned.
- `src/client/api/book.ts` — book owner collection and id-or-namespace item API wrappers.
- `src/client/api/doc.ts` — document CRUD, global-id lookup, and published-version API wrappers.
- `src/client/api/group.ts` — group-member list/update/remove API wrappers.
- `src/client/api/note.ts` — note CRUD-without-delete wrappers, including the create and double-wrapped update response quirks.
- `src/client/api/resource.ts` — structured-board read/create/update wrappers using the public wire field names.
- `src/client/api/search.ts` — doc/repo search API wrapper.
- `src/client/api/stats.ts` — group aggregate and paged member/book/doc statistics API wrappers, including the live-array correction to the spec types.
- `src/client/api/toc.ts` — book TOC read/update API wrappers and update-body shape.
- `src/client/api/user.ts` — heartbeat, current-user, and user-groups API wrappers.
- `src/client/book-ref.ts` — parses a book reference as a numeric id or `group/slug` and produces the encoded `/repos/...` base path.
- `src/client/paginate.ts` — drains offset-paged or explicit `has_more` endpoints for `--all`.
- `src/client/types.gen.ts` — generated from `spec/yuque-openapi.yaml`; edit the spec and run `npm run gen:types`, never edit this file directly.
- `src/client/types.ts` — thin compatibility adapter over the generated schemas; preserves public type names, live-API extensions, and index signatures for `--json` pass-through.
- `spec/yuque-openapi.yaml` — vendored upstream OpenAPI contract and source of truth for the supported operation surface.
- `scripts/smoke-dist-cli.js` — spawns `dist/bin.js` as an installed CLI would and checks version/help plus representative usage/auth exit codes.
- `tests/commands/` — mocked command-action unit tests for exact requests, rendering, validation, confirmation, and exit behavior.
- `tests/client/` — transport retry/error and book-reference unit contracts.
- `tests/docs/` — programmatic drift locks for README command coverage and this repository guide.
- `tests/e2e/` — built-binary functional tests: always-on mock-server wire assertions plus env-gated real-API coverage.
- `tests/spec-coverage.test.ts` — pins every operationId + method + path to registered leaf commands and locks the expected command list.

## Contracts & locks

- Command surface is **locked 1:1 against `spec/yuque-openapi.yaml`** by `tests/spec-coverage.test.ts`; adding/renaming a command or refreshing the spec requires a deliberate mapping update.
- Both READMEs are locked by `tests/docs/command-surface-docs.test.ts` for the exact heading count and exact registered leaf-command set; keep README.md and README.zh-CN.md strictly isomorphic.
- Exit codes are stable and scripts may rely on them: `0 success · 1 API/unknown error · 2 usage error · 3 auth error · 4 not found · 5 rate limited` (`src/errors.ts`).
- All HTTP goes through `src/client/http.ts`; command handlers never call axios directly.
- Human output goes through `src/output.ts`; `--json` prints the complete unprojected payload returned by the API wrapper.
- `npm run check` is the merge gate and matches CI: lint, format check, generated-type drift check, typecheck, coverage-enforced unit tests, one build, dist smoke, then functional e2e.
- New or changed commands need always-on mock-server coverage in `tests/e2e/`, not only unit coverage; see `tests/e2e/README.md` for the optional real-API gates.

## Adding a command

1. Add the typed wrapper in `src/client/api/<domain>.ts`; take `http` first and `return res.data` to unwrap `ApiEnvelope`.
2. Register the subcommand in `src/commands/<domain>.ts`; action order is local flag validation (`UsageError`) → `confirmDestructive` for destructive work, before `getContext` → `getContext(cmd)` → API call → `if (ctx.json) { printJson(raw); return; }` with the complete wrapper result → `printOk`/`printTable`/`printRecord`.
3. For a new domain, add the import at the top of `src/cli.ts` and call its register function inside `buildProgram`.
4. Update the `OPERATION_TO_COMMANDS` operationId + method + path tuples and `EXPECTED_LEAF_COMMANDS` in `tests/spec-coverage.test.ts`.
5. Update `README.md` and `README.zh-CN.md`: increment each commands-section heading count and add an isomorphic command-table row; `tests/docs/command-surface-docs.test.ts` locks both.
6. Regenerate the pinned help surface — `UPDATE_HELP_GOLDEN=1 npx vitest run tests/docs/help-surface.test.ts` — and review the `tests/docs/help-surface.golden.json` diff; any new or changed flag must appear there deliberately.
7. Add `tests/commands/` unit coverage with exact request assertions and the expected process exit code.
8. Add a `tests/e2e/` mock-suite case with wire-level request assertions against the built binary.
9. Run `npm run check` and require the complete gate to pass.

## Conventions & gotchas

- ESM is mandatory (`package.json` has `"type": "module"`); relative TypeScript imports use `.js` suffixes because those are the emitted runtime paths.
- Runtime support is Node >= 20, as pinned by `package.json#engines`.
- For new flag validation, use `Option.choices` for enums or an argument parser that throws `UsageError`; both map to exit 2 because `buildProgram` calls `exitOverride` before registration and Commander copies that callback into subcommands (`tests/commands/flag-validation.test.ts` locks this). Put cross-field and semantic-required checks inside the action and throw `UsageError`; do not introduce new `InvalidArgumentError` parsers.
- Destructive actions call `confirmDestructive` before `getContext`, so confirmation precedes auth/client setup; every such command supports `--yes`.
- Convenience scripts: `npm run lint:fix` fixes lint, `npm run format` writes formatting, `npm run test:watch` watches unit tests, `npm run test:coverage` runs coverage, and `npm run dev` runs `src/bin.ts` directly through tsx.
- Smoke and e2e exercise built `dist` output: `npm run smoke:dist` and `npm run test:e2e` build first, while `npm run check` builds once then calls their `:built` variants.
- Release work includes updating `CHANGELOG.md`; npm's `prepublishOnly` lifecycle runs the build before publication.
