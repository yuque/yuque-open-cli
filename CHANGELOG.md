# Changelog

## 1.1.0

Knowledge bases are now `book` across the CLI surface, aligning with Yuque's
own terminology (知识库 = book, matching the API's `V2Book`/`book_id`). The
`repo` command group from 1.0.0 (released the same day) is replaced by `book`:

- `repo list/get/create/update/delete` → `book list/get/create/update/delete`;
  `<repo>` arguments are now `<book>`.
- `search --type` takes `doc|book` (`repo` still accepted as a compatibility
  alias; the wire value is unchanged).
- Help text and READMEs updated accordingly. HTTP paths (`/repos/...`) and env
  variables (`YUQUE_E2E_REPO`) are unchanged.

## 1.0.0

Initial release of `yuque-open-cli` — a spec-driven, scriptable command-line
interface for Yuque:

- 26 noun-verb commands covering all 38 operations of the Yuque OpenAPI —
  auth/ping, user, search, repos, docs (incl. version history), TOC, group
  members, and team statistics; repos accept a numeric id or `owner/slug`
  everywhere.
- Token auth via `YUQUE_TOKEN` / `--token` (flag wins; `YUQUE_PERSONAL_TOKEN`
  compatibility fallback); custom hosts via `YUQUE_HOST` / `--host`; timeouts
  via `YUQUE_TIMEOUT_MS` / `--timeout`.
- Human-readable output with `--json` full-payload mode, stable exit codes
  (0/1/2/3/4/5), `--all` pagination, automatic backoff on rate limits (writes
  are never silently replayed), and confirmation gates on destructive commands.
- Command surface locked 1:1 against the vendored OpenAPI spec by contract
  tests; functional e2e suite drives the built binary in CI.
