import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { buildProgram } from '../src/cli.js';

/**
 * Contract: the CLI command surface is locked 1:1 against spec/yuque-openapi.yaml.
 *
 * Every OpenAPI operation must be handled by at least one command, and every
 * registered leaf command must trace back to at least one operation. Changing
 * either side (spec refresh, new command) requires updating this table — that
 * is deliberate, the same pinning culture as yuque-mcp-server's contract tests.
 */

/** operationId -> CLI command path(s) that call it. */
const OPERATION_TO_COMMANDS: Record<string, string[]> = {
  user_api_v2_hello: ['ping'],
  user_api_v2_user_info: ['auth status', 'user info'],
  user_api_v2_user_group_list: ['user groups'],
  search_api_v2_search: ['search'],
  group_api_v2_group_member_list: ['group members'],
  group_api_v2_group_member_update: ['group member set'],
  group_api_v2_group_member_destroy: ['group member remove'],
  'doc_api_v2_doc_list-by_id': ['doc list'],
  'doc_api_v2_doc_create-by_id': ['doc create'],
  'doc_api_v2_doc_show-by_id': ['doc get'],
  'doc_api_v2_doc_show-by_book_and_id': ['doc get'],
  'doc_api_v2_doc_update-by_id': ['doc update'],
  'doc_api_v2_doc_destroy-by_id': ['doc delete'],
  doc_api_v2_doc_list: ['doc list'],
  doc_api_v2_doc_create: ['doc create'],
  doc_api_v2_doc_show: ['doc get'],
  doc_api_v2_doc_update: ['doc update'],
  doc_api_v2_doc_destroy: ['doc delete'],
  doc_api_v2_doc_version_list: ['doc versions'],
  doc_api_v2_doc_version_show: ['doc version'],
  'doc_api_v2_repo_toc_show-by_id': ['toc get'],
  'doc_api_v2_repo_toc_update-by_id': ['toc update'],
  doc_api_v2_repo_toc_show: ['toc get'],
  doc_api_v2_repo_toc_update: ['toc update'],
  'repo_api_v2_repo_list-by_group': ['repo list'],
  'repo_api_v2_repo_create-by_group': ['repo create'],
  repo_api_v2_repo_list: ['repo list'],
  repo_api_v2_repo_create: ['repo create'],
  'repo_api_v2_repo_show-by_id': ['repo get'],
  'repo_api_v2_repo_update-by_id': ['repo update'],
  'repo_api_v2_repo_destroy-by_id': ['repo delete'],
  repo_api_v2_repo_show: ['repo get'],
  repo_api_v2_repo_update: ['repo update'],
  repo_api_v2_repo_destroy: ['repo delete'],
  statistic_api_v2_statistic_all: ['stats group'],
  statistic_api_v2_statistic_by_members: ['stats members'],
  statistic_api_v2_statistic_by_books: ['stats books'],
  statistic_api_v2_statistic_by_docs: ['stats docs'],
};

const EXPECTED_LEAF_COMMANDS = [
  'ping',
  'auth status',
  'user info',
  'user groups',
  'search',
  'group members',
  'group member set',
  'group member remove',
  'repo list',
  'repo get',
  'repo create',
  'repo update',
  'repo delete',
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
].sort();

interface SpecOperation {
  operationId: string;
  method: string;
  path: string;
}

function loadSpecOperations(): SpecOperation[] {
  const specPath = fileURLToPath(new URL('../spec/yuque-openapi.yaml', import.meta.url));
  const spec = load(readFileSync(specPath, 'utf8')) as {
    paths: Record<string, Record<string, { operationId?: string }>>;
  };
  const operations: SpecOperation[] = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
      const operation = item[method];
      if (operation?.operationId) {
        operations.push({ operationId: operation.operationId, method, path });
      }
    }
  }
  return operations;
}

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

describe('spec coverage contract', () => {
  const operations = loadSpecOperations();
  const registeredLeaves = collectLeafCommands(buildProgram()).sort();

  it('pins the spec identity (38 operations)', () => {
    expect(operations).toHaveLength(38);
  });

  it('maps every spec operation to at least one CLI command', () => {
    const unmapped = operations.filter((op) => !OPERATION_TO_COMMANDS[op.operationId]);
    expect(
      unmapped.map((op) => `${op.operationId} (${op.method.toUpperCase()} ${op.path})`)
    ).toEqual([]);
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
    const missing = [...new Set(Object.values(OPERATION_TO_COMMANDS).flat())].filter(
      (commandPath) => !registered.has(commandPath)
    );
    expect(missing).toEqual([]);
  });

  it('every leaf command traces back to a spec operation', () => {
    const mapped = new Set(Object.values(OPERATION_TO_COMMANDS).flat());
    const orphans = registeredLeaves.filter((commandPath) => !mapped.has(commandPath));
    expect(orphans).toEqual([]);
  });
});
