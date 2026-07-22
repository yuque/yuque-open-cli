import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { buildProgram } from '../../src/cli.js';

/**
 * Docs lock: both READMEs must state the exact command count in their section
 * heading and list every registered leaf command, mirroring the tool-surface
 * lock in yuque-mcp-server.
 */

function collectLeafCommands(command: Command, prefix: string[] = []): string[] {
  const leaves: string[] = [];
  for (const sub of command.commands) {
    const path = [...prefix, sub.name()];
    if (sub.commands.length === 0) leaves.push(path.join(' '));
    else leaves.push(...collectLeafCommands(sub, path));
  }
  return leaves;
}

const leaves = collectLeafCommands(buildProgram());

function readReadme(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), 'utf8');
}

describe.each([
  { file: 'README.md', heading: new RegExp(`^## Commands \\((\\d+)\\)$`, 'm') },
  { file: 'README.zh-CN.md', heading: new RegExp(`^## 命令列表（(\\d+) 个）$`, 'm') },
])('$file', ({ file, heading }) => {
  const content = readReadme(file);

  it('states the exact command count in the section heading', () => {
    const match = content.match(heading);
    expect(match, `missing command-count heading in ${file}`).not.toBeNull();
    expect(Number(match?.[1])).toBe(leaves.length);
  });

  it('mentions every registered command', () => {
    const missing = leaves.filter((leaf) => !content.includes(`\`${leaf}`));
    expect(missing).toEqual([]);
  });
});
