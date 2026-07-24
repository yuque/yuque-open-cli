import type { Command } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { printJson, printTable } from '../output.js';
import { search } from '../client/api/search.js';

// CLI surface says `book` (知识库); the wire enum is doc|repo, and `repo` stays
// accepted as a compatibility alias mapped to the same wire value.
const SEARCH_TYPES = ['doc', 'book', 'repo'];

// Keep required/enum/integer checks as action-level UsageError throws to control
// the error wording. Commander's own choices/argParser errors also satisfy the
// exit-code contract (exitOverride is installed before registration).
function pageFlag(flag: '--page' | '--offset'): (value: string) => number {
  return (value) => {
    if (!/^\d+$/.test(value) || Number(value) < 1) {
      throw new UsageError(`${flag} expects a positive integer, got "${value}"`);
    }
    if (Number(value) > 100) {
      throw new UsageError(`${flag} is capped at 100 by the Yuque API, got ${value}`);
    }
    return Number(value);
  };
}

export function registerSearchCommands(program: Command): void {
  const cmd = program
    .command('search')
    .description('Search docs or books')
    .argument('<query>', 'search keywords')
    .option('--type <type>', 'what to search for: doc or book (required)')
    .option('--scope <ns>', 'restrict to a group or group/book namespace')
    .option('--creator <login>', 'only results created by this user')
    .option('--page <n>', 'page number (page size is fixed at 20)', pageFlag('--page'))
    .option(
      '--offset <n>',
      'legacy page number sent as API offset (not a record offset)',
      pageFlag('--offset')
    );
  cmd.action(async (query: string) => {
    const opts = cmd.opts<{
      type?: string;
      scope?: string;
      creator?: string;
      page?: number;
      offset?: number;
    }>();
    if (!opts.type) throw new UsageError('--type <doc|book> is required');
    if (!SEARCH_TYPES.includes(opts.type)) {
      throw new UsageError(`invalid --type "${opts.type}" — expected doc or book`);
    }
    const ctx = getContext(cmd);
    const results = await search(ctx.http, {
      q: query,
      type: opts.type === 'book' ? 'repo' : (opts.type as 'doc' | 'repo'),
      scope: opts.scope,
      creator: opts.creator,
      page: opts.page,
      offset: opts.offset,
    });
    if (ctx.json) {
      printJson(results);
      return;
    }
    printTable(results, [
      { key: 'type', header: 'TYPE' },
      { key: 'title', header: 'TITLE' },
      { key: 'url', header: 'URL' },
    ]);
  });
}
