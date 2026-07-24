# Security Policy

## Supported versions

Only the latest release published on npm receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/yuque/yuque-open-cli/security/advisories/new)
— do not open a public issue.

Include what you can: affected version, reproduction steps, and impact. You
can expect an acknowledgement within a few business days.

## Scope notes for this CLI

- The CLI authenticates with a Yuque API token supplied via `--token`,
  `YUQUE_TOKEN`, or `YUQUE_PERSONAL_TOKEN`. Tokens are only ever sent to the
  configured Yuque host (`https://www.yuque.com` by default, or the host you
  set via `--host` / `YUQUE_HOST`) as the `X-Auth-Token` header.
- The CLI never writes your token to disk. Prefer the environment variable
  over `--token` in shared environments — command-line flags can be visible
  to other processes and shell history.
- Anything that would trick the CLI into sending the token to a non-Yuque
  host, leaking it into output/logs, or executing content returned by the
  API is in scope and we want to hear about it.
