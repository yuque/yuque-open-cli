import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuthError, UsageError, exitCodeForStatus } from '../../src/errors.js';

type ExitCodeSemantic =
  | 'success'
  | 'api-or-unknown-error'
  | 'usage-error'
  | 'authentication-error'
  | 'not-found'
  | 'rate-limited';

interface ExitCodeRow {
  code: number;
  meaning: string;
}

interface RepositoryReference {
  slug: string;
  url: string;
}

const DOCUMENT_FILES = ['README.md', 'README.zh-CN.md', 'AGENTS.md', 'CHANGELOG.md'] as const;
const OLD_REPOSITORY_SLUG = 'yuque/yuque-cli';
const EXTERNAL_REPOSITORY_SLUGS = new Set(['yuque/yuque-mcp-server']);

function readRepositoryFile(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), 'utf8');
}

function buildExitCodeContract(): Map<number, ExitCodeSemantic> {
  const sources: Array<[number, ExitCodeSemantic]> = [
    [0, 'success'],
    [exitCodeForStatus(500), 'api-or-unknown-error'],
    [new UsageError('test usage error').exitCode, 'usage-error'],
    [new AuthError('test auth error').exitCode, 'authentication-error'],
    [exitCodeForStatus(401), 'authentication-error'],
    [exitCodeForStatus(403), 'authentication-error'],
    [exitCodeForStatus(404), 'not-found'],
    [exitCodeForStatus(429), 'rate-limited'],
  ];
  const contract = new Map<number, ExitCodeSemantic>();

  for (const [code, semantic] of sources) {
    const previous = contract.get(code);
    if (previous !== undefined && previous !== semantic) {
      throw new Error(`exit code ${code} has conflicting semantics: ${previous} and ${semantic}`);
    }
    contract.set(code, semantic);
  }

  return new Map([...contract].sort(([left], [right]) => left - right));
}

function markdownSection(content: string, heading: string): string {
  const start = content.indexOf(`${heading}\n`);
  if (start === -1) throw new Error(`missing markdown heading: ${heading}`);
  const end = content.indexOf('\n## ', start + heading.length);
  return content.slice(start, end === -1 ? undefined : end);
}

function parseExitCodeRows(section: string): ExitCodeRow[] {
  return [...section.matchAll(/^\|\s*`(\d+)`\s*\|\s*([^|\n]+?)\s*\|$/gm)].map((match) => ({
    code: Number(match[1]),
    meaning: (match[2] ?? '').trim(),
  }));
}

function troubleshootingExitCodeReferences(section: string): number[] {
  return [...section.matchAll(/\(exit\s+`(\d+)`\)|（退出码\s+`(\d+)`）/g)].map((match) =>
    Number(match[1] ?? match[2])
  );
}

function canonicalRepositorySlug(repositoryUrl: string): string {
  const url = new URL(repositoryUrl);
  if (url.hostname !== 'github.com') {
    throw new Error(`repository URL must use github.com: ${repositoryUrl}`);
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(`repository URL must contain one owner and repository: ${repositoryUrl}`);
  }

  const owner = parts[0];
  const repository = parts[1]?.replace(/\.git$/, '');
  if (!owner || !repository) throw new Error(`invalid repository URL: ${repositoryUrl}`);
  return `${owner}/${repository}`;
}

function repositorySlugFromUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const parts = url.pathname.split('/').filter(Boolean);

  if (url.hostname === 'github.com') {
    const owner = parts[0];
    const repository = parts[1]?.replace(/\.git$/, '');
    if (!owner || !repository) throw new Error(`invalid GitHub repository URL: ${rawUrl}`);
    return `${owner}/${repository}`;
  }

  if (url.hostname === 'img.shields.io' && parts[0] === 'github') {
    const slugOffset =
      parts[1] === 'actions' && parts[2] === 'workflow' && parts[3] === 'status' ? 4 : 2;
    const owner = parts[slugOffset];
    const repository = parts[slugOffset + 1];
    if (!owner || !repository) throw new Error(`invalid GitHub shields URL: ${rawUrl}`);
    return `${owner}/${repository}`;
  }

  throw new Error(`unsupported repository URL: ${rawUrl}`);
}

function githubRepositoryReferences(content: string): RepositoryReference[] {
  const urls = [
    ...content.matchAll(/https?:\/\/(?:github\.com\/|img\.shields\.io\/github\/)[^\s)<>\]]+/g),
  ].map((match) => match[0]);

  return urls.map((url) => ({ slug: repositorySlugFromUrl(url), url }));
}

const exitCodeContract = buildExitCodeContract();
const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
  repository: string | { url: string };
};
const repositoryUrl =
  typeof packageJson.repository === 'string' ? packageJson.repository : packageJson.repository.url;
const canonicalSlug = canonicalRepositorySlug(repositoryUrl);

describe('exit-code docs-lock helpers', () => {
  it('constructs every semantic from the runtime exit-code sources', () => {
    expect([...exitCodeContract]).toEqual([
      [0, 'success'],
      [1, 'api-or-unknown-error'],
      [2, 'usage-error'],
      [3, 'authentication-error'],
      [4, 'not-found'],
      [5, 'rate-limited'],
    ]);
  });

  it('extracts only backticked numeric rows from an exit-code table', () => {
    const section = [
      '## Output',
      '',
      '| Code | Meaning |',
      '| --- | --- |',
      '| `0` | Success |',
      '| `5` | Rate limited |',
      '| 6 | Missing backticks |',
      '',
      'A troubleshooting reference (exit `3`) is not a table row.',
    ].join('\n');

    expect(parseExitCodeRows(section)).toEqual([
      { code: 0, meaning: 'Success' },
      { code: 5, meaning: 'Rate limited' },
    ]);
  });

  it('extracts bounded markdown sections and both troubleshooting reference styles', () => {
    const content = [
      '## Troubleshooting',
      '',
      'English (exit `3`) and 中文（退出码 `5`）.',
      '',
      '## Later',
      '',
      'Ignore (exit `99`).',
    ].join('\n');
    const section = markdownSection(content, '## Troubleshooting');

    expect(section).not.toContain('Ignore');
    expect(troubleshootingExitCodeReferences(section)).toEqual([3, 5]);
  });

  it('extracts repository slugs from package, GitHub, and shields URL shapes', () => {
    expect(canonicalRepositorySlug('https://github.com/owner/repository.git')).toBe(
      'owner/repository'
    );
    expect(repositorySlugFromUrl('https://github.com/owner/repository/actions')).toBe(
      'owner/repository'
    );
    expect(
      repositorySlugFromUrl('https://img.shields.io/github/license/owner/repository?style=flat')
    ).toBe('owner/repository');
    expect(
      repositorySlugFromUrl(
        'https://img.shields.io/github/actions/workflow/status/owner/repository/ci.yml'
      )
    ).toBe('owner/repository');
  });
});

describe.each([
  {
    file: 'README.md',
    outputHeading: '## Output & scripting',
    troubleshootingHeading: '## Troubleshooting',
    meanings: {
      success: 'Success',
      'api-or-unknown-error': 'API or unknown error',
      'usage-error': 'Usage error',
      'authentication-error': 'Authentication error',
      'not-found': 'Not found',
      'rate-limited': 'Rate limited',
    } satisfies Record<ExitCodeSemantic, string>,
  },
  {
    file: 'README.zh-CN.md',
    outputHeading: '## 输出与脚本化',
    troubleshootingHeading: '## 常见问题',
    meanings: {
      success: '成功',
      'api-or-unknown-error': 'API 或未知错误',
      'usage-error': '用法错误',
      'authentication-error': '认证错误',
      'not-found': '资源不存在',
      'rate-limited': '触发限流',
    } satisfies Record<ExitCodeSemantic, string>,
  },
])('$file exit-code contract', ({ file, outputHeading, troubleshootingHeading, meanings }) => {
  const content = readRepositoryFile(file);
  const rows = parseExitCodeRows(markdownSection(content, outputHeading));

  it('documents exactly the authoritative exit-code set and row count', () => {
    const documentedCodes = new Set(rows.map(({ code }) => code));
    expect([...documentedCodes].sort((left, right) => left - right)).toEqual([
      ...exitCodeContract.keys(),
    ]);
    expect(rows).toHaveLength(exitCodeContract.size);
  });

  it('keeps each documented meaning attached to its authoritative code', () => {
    for (const row of rows) {
      const semantic = exitCodeContract.get(row.code);
      expect(semantic, `unexpected exit code ${row.code} in ${file}`).toBeDefined();
      expect(row.meaning).toBe(meanings[semantic as ExitCodeSemantic]);
    }
  });

  it('uses only authoritative exit codes in troubleshooting references', () => {
    const references = troubleshootingExitCodeReferences(
      markdownSection(content, troubleshootingHeading)
    );
    expect(references.length).toBeGreaterThan(0);
    expect(references.filter((code) => !exitCodeContract.has(code))).toEqual([]);
  });
});

describe('AGENTS.md exit-code contract', () => {
  const agentsMd = readRepositoryFile('AGENTS.md');

  it('mentions every authoritative code on the stable contract line', () => {
    const contractLine = agentsMd
      .split('\n')
      .find((line) => line.startsWith('- Exit codes are stable and scripts may rely on them:'));
    expect(contractLine, 'missing stable exit-code contract line in AGENTS.md').toBeDefined();

    for (const code of exitCodeContract.keys()) {
      expect(contractLine).toMatch(new RegExp(`(?:^|\\D)${code}(?:\\D|$)`));
    }
  });
});

describe('repository-name docs lock', () => {
  const documents = DOCUMENT_FILES.map((file) => ({
    content: readRepositoryFile(file),
    file,
  }));

  it('derives the canonical slug from package.json', () => {
    expect(canonicalSlug).toBe('yuque/yuque-open-cli');
  });

  it.each(documents)('$file uses the canonical slug in repository URLs', ({ content, file }) => {
    const unexpected = githubRepositoryReferences(content).filter(
      ({ slug }) => slug !== canonicalSlug && !EXTERNAL_REPOSITORY_SLUGS.has(slug)
    );
    expect(unexpected, `stale repository URL in ${file}`).toEqual([]);
  });

  it.each(documents)('$file does not contain the old repository slug', ({ content }) => {
    // A direct includes check is exact enough here: yuque/yuque-cli is not a
    // substring of the canonical yuque/yuque-open-cli slug.
    expect(content.includes(OLD_REPOSITORY_SLUG)).toBe(false);
  });
});
