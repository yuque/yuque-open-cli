import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Repository-guide lock: every TypeScript source file must be discoverable in
 * AGENTS.md, critical workflow anchors must remain documented, and every
 * documented `npm run` command must resolve to a package script.
 */

function collectTypeScriptPaths(directory: string, root: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...collectTypeScriptPaths(path, root));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      paths.push(relative(root, path).split(sep).join('/'));
    }
  }
  return paths.sort();
}

function mentionedNpmScripts(content: string): string[] {
  return [
    ...new Set(
      [...content.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1] ?? '')
    ),
  ].sort();
}

describe('AGENTS.md lock helpers', () => {
  it('recursively collects only TypeScript files as repository-relative POSIX paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'yuque-agents-md-'));
    try {
      mkdirSync(join(root, 'src', 'nested'), { recursive: true });
      writeFileSync(join(root, 'src', 'root.ts'), '');
      writeFileSync(join(root, 'src', 'nested', 'leaf.ts'), '');
      writeFileSync(join(root, 'src', 'nested', 'ignored.js'), '');
      expect(collectTypeScriptPaths(join(root, 'src'), root)).toEqual([
        'src/nested/leaf.ts',
        'src/root.ts',
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('extracts unique colon-bearing npm script names without treating npm test as npm run', () => {
    const content =
      'Use `npm run check`, npm run test:e2e, and npm run check; plain npm test is separate.';
    expect(mentionedNpmScripts(content)).toEqual(['check', 'test:e2e']);
  });
});

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const agentsMd = readFileSync(join(repositoryRoot, 'AGENTS.md'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};

describe('AGENTS.md', () => {
  it('maps every TypeScript source file by its exact relative path', () => {
    const sourcePaths = collectTypeScriptPaths(join(repositoryRoot, 'src'), repositoryRoot);
    expect(sourcePaths.filter((path) => !agentsMd.includes(path))).toEqual([]);
  });

  it.each([
    'npm run check',
    'tests/spec-coverage.test.ts',
    'tests/docs/command-surface-docs.test.ts',
    'confirmDestructive',
    '0 success · 1 API/unknown error · 2 usage error · 3 auth error · 4 not found · 5 rate limited',
  ])('contains the critical anchor %s', (anchor) => {
    expect(agentsMd).toContain(anchor);
  });

  it('only mentions npm run scripts that exist in package.json', () => {
    const scripts = new Set(Object.keys(packageJson.scripts ?? {}));
    expect(mentionedNpmScripts(agentsMd).filter((script) => !scripts.has(script))).toEqual([]);
  });
});
