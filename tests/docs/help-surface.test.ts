import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Command, type Option } from 'commander';
import { buildProgram } from '../../src/cli.js';

/**
 * Help-surface contract: every leaf command's description, arguments, and
 * options are pinned to a reviewed golden file. This catches flag-level drift
 * that the OpenAPI operation and command-name locks deliberately cannot see.
 *
 * Command paths and option flags are sorted before serialization so the file
 * only changes when the registered help surface changes, not when traversal or
 * object iteration order happens to change.
 */

interface GoldenArgument {
  name: string;
  required: boolean;
  description: string;
  variadic: boolean;
}

interface GoldenOption {
  flags: string;
  description: string;
  defaultValue?: unknown;
  choices?: string[];
}

interface GoldenCommand {
  path: string;
  description: string;
  arguments: GoldenArgument[];
  options: GoldenOption[];
}

interface HelpSurface {
  globalOptions: GoldenOption[];
  commands: GoldenCommand[];
}

const goldenPath = fileURLToPath(new URL('./help-surface.golden.json', import.meta.url));
const UPDATE_INSTRUCTIONS =
  'Help surface changed. If intentional, regenerate with UPDATE_HELP_GOLDEN=1 ' +
  'npx vitest run tests/docs/help-surface.test.ts and include the golden diff in review.';

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function serializeOption(option: Option): GoldenOption {
  return {
    flags: option.flags,
    description: option.description,
    ...(option.defaultValue !== undefined && { defaultValue: option.defaultValue }),
    ...(option.argChoices !== undefined && { choices: [...option.argChoices] }),
  };
}

function collectLeafCommands(
  command: Command,
  prefix: string[] = []
): Array<{ path: string; command: Command }> {
  const leaves: Array<{ path: string; command: Command }> = [];
  for (const sub of command.commands) {
    const path = [...prefix, sub.name()];
    if (sub.commands.length === 0) {
      leaves.push({ path: path.join(' '), command: sub });
    } else {
      leaves.push(...collectLeafCommands(sub, path));
    }
  }
  return leaves;
}

function serializeHelpSurface(program: Command): HelpSurface {
  // Commander stores the version option alongside user-defined global options.
  // Version and automatic help are framework affordances; this contract records
  // the four operational globals named in the public CLI surface.
  const globalOptions = program.options
    .filter((option) => option.long !== '--version')
    .map(serializeOption)
    .sort((left, right) => compareText(left.flags, right.flags));

  const commands = collectLeafCommands(program)
    .map(({ path, command }) => ({
      path,
      description: command.description(),
      arguments: command.registeredArguments.map((argument) => ({
        name: argument.name(),
        required: argument.required,
        description: argument.description,
        variadic: argument.variadic,
      })),
      options: command.options
        .map(serializeOption)
        .sort((left, right) => compareText(left.flags, right.flags)),
    }))
    .sort((left, right) => compareText(left.path, right.path));

  return { globalOptions, commands };
}

function readReadme(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${name}`, import.meta.url)), 'utf8');
}

function registeredFlagTokens(program: Command): Set<string> {
  const tokens = new Set<string>(['--help']);
  const addOptions = (options: readonly Option[]): void => {
    for (const option of options) {
      if (option.short !== undefined) tokens.add(option.short);
      if (option.long !== undefined) tokens.add(option.long);
    }
  };

  addOptions(program.options);
  for (const { command } of collectLeafCommands(program)) addOptions(command.options);
  return tokens;
}

function documentedFlagTokens(content: string): string[] {
  return [
    ...new Set([...content.matchAll(/--[a-zA-Z0-9][a-zA-Z0-9-]*/g)].map((match) => match[0])),
  ].sort(compareText);
}

const README_FLAG_ALLOWLIST = [
  // Markdown fragment in the `#output--scripting` navigation link, not a CLI flag.
  '--scripting',
];

describe('help surface golden contract', () => {
  it('pins every leaf command argument and option', () => {
    const actual = serializeHelpSurface(buildProgram());
    if (process.env.UPDATE_HELP_GOLDEN === '1') {
      writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
    }
    const expected = JSON.parse(readFileSync(goldenPath, 'utf8')) as HelpSurface;
    expect(actual, UPDATE_INSTRUCTIONS).toEqual(expected);
  });
});

describe.each(['README.md', 'README.zh-CN.md'])('%s flag reverse lock', (file) => {
  it('mentions only registered CLI flags', () => {
    const registered = registeredFlagTokens(buildProgram());
    const allowlisted = new Set(README_FLAG_ALLOWLIST);
    const unknown = documentedFlagTokens(readReadme(file)).filter(
      (flag) => !registered.has(flag) && !allowlisted.has(flag)
    );
    expect(unknown, `${file} contains flags that are not registered by the CLI`).toEqual([]);
  });
});
