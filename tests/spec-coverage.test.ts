import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { buildProgram } from '../src/cli.js';
import { loadSpecOperations, OPERATION_TO_COMMANDS } from './utils/spec.js';

/**
 * Contract: the CLI command surface is locked 1:1 against spec/yuque-openapi.yaml.
 *
 * Every OpenAPI operation must be handled by at least one command, and every
 * registered leaf command must trace back to at least one operation. Each row
 * additionally pins the operation's method + path, so a mapping cannot be
 * "satisfied" by pointing an operationId at an unrelated command: repurposing
 * an operationId or drifting a path fails the method/path pin below. Changing
 * either side (spec refresh, new command) requires updating this table — that
 * is deliberate, the same pinning culture as yuque-mcp-server's contract tests.
 */

const EXPECTED_LEAF_COMMANDS = [
  'ping',
  'auth status',
  'user info',
  'user groups',
  'search',
  'group members',
  'group member set',
  'group member remove',
  'book list',
  'book get',
  'book create',
  'book update',
  'book delete',
  'doc list',
  'doc get',
  'doc create',
  'doc update',
  'doc delete',
  'doc versions',
  'doc version',
  'toc get',
  'toc update',
  'stats group',
  'stats members',
  'stats books',
  'stats docs',
  'note list',
  'note get',
  'note create',
  'note update',
  'resource get',
  'resource create',
  'resource update',
].sort();

function collectLeafCommands(command: Command, prefix: string[] = []): string[] {
  const leaves: string[] = [];
  for (const sub of command.commands) {
    const path = [...prefix, sub.name()];
    if (sub.commands.length === 0) {
      leaves.push(path.join(' '));
    } else {
      leaves.push(...collectLeafCommands(sub, path));
    }
  }
  return leaves;
}

const mappedCommands = () => Object.values(OPERATION_TO_COMMANDS).flatMap((row) => row.commands);

describe('spec coverage contract', () => {
  const { operations, missingOperationIds } = loadSpecOperations();
  const registeredLeaves = collectLeafCommands(buildProgram()).sort();

  it('pins the spec identity (45 operations)', () => {
    expect(operations).toHaveLength(45);
  });

  it('has no spec operation without an operationId', () => {
    // A spec refresh adding an operationId-less path must not silently escape
    // the contract: every method+path entry has to carry an operationId.
    expect(missingOperationIds).toEqual([]);
  });

  it('maps every spec operation to at least one CLI command', () => {
    const unmapped = operations.filter((op) => !OPERATION_TO_COMMANDS[op.operationId]);
    expect(
      unmapped.map((op) => `${op.operationId} (${op.method.toUpperCase()} ${op.path})`)
    ).toEqual([]);
  });

  it('pins each mapped operation to its spec method and path', () => {
    const mismatched = operations
      .filter((op) => {
        const row = OPERATION_TO_COMMANDS[op.operationId];
        return row !== undefined && (row.method !== op.method || row.path !== op.path);
      })
      .map((op) => `${op.operationId}: spec has ${op.method.toUpperCase()} ${op.path}`);
    expect(mismatched).toEqual([]);
  });

  it('has no stale operationIds in the mapping table', () => {
    const known = new Set(operations.map((op) => op.operationId));
    const stale = Object.keys(OPERATION_TO_COMMANDS).filter((id) => !known.has(id));
    expect(stale).toEqual([]);
  });

  it('registers exactly the expected leaf commands', () => {
    expect(registeredLeaves).toEqual(EXPECTED_LEAF_COMMANDS);
  });

  it('every mapped command exists in the program', () => {
    const registered = new Set(registeredLeaves);
    const missing = [...new Set(mappedCommands())].filter(
      (commandPath) => !registered.has(commandPath)
    );
    expect(missing).toEqual([]);
  });

  it('every leaf command traces back to a spec operation', () => {
    const mapped = new Set(mappedCommands());
    const orphans = registeredLeaves.filter((commandPath) => !mapped.has(commandPath));
    expect(orphans).toEqual([]);
  });
});
