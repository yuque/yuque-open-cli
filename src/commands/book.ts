import type { Command } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { confirmDestructive } from '../confirm.js';
import { printJson, printOk, printRecord, printTable } from '../output.js';
import { parseBookRef } from '../client/book-ref.js';
import { fetchAllPages } from '../client/paginate.js';
import {
  createBook,
  deleteBook,
  getBook,
  listBooks,
  updateBook,
  type CreateBookBody,
  type BookOwner,
  type UpdateBookBody,
} from '../client/api/book.js';
import type { V2Book } from '../client/types.js';

function parseNonNegativeInt(value: string): number {
  if (!/^\d+$/.test(value.trim())) {
    throw new UsageError(`Expected a non-negative integer, got "${value}"`);
  }
  return Number(value);
}

/** The spec caps `limit` at 100 for book listing. */
function parseLimit(value: string): number {
  const limit = parseNonNegativeInt(value);
  if (limit > 100) throw new UsageError(`--limit is capped at 100 by the Yuque API, got ${limit}`);
  return limit;
}

/** Spec enum for book visibility. */
function parsePublic(value: string): number {
  if (!['0', '1', '2'].includes(value.trim())) {
    throw new UsageError(
      `--public must be 0 (private), 1 (public), or 2 (org-only), got "${value}"`
    );
  }
  return Number(value);
}

const LIST_TYPES = ['Book', 'Design', 'all'];

/** `all` (like omitting the flag) means no server-side filter; the spec enum is Book|Design. */
function typeFilter(value: string | undefined): string | undefined {
  if (value === undefined || value === 'all') return undefined;
  if (!LIST_TYPES.includes(value)) {
    throw new UsageError(`Invalid --type "${value}" — expected one of: ${LIST_TYPES.join(', ')}`);
  }
  return value;
}

function bookLabel(book: V2Book): string {
  return String(book.namespace ?? book.slug);
}

export function registerBookCommands(program: Command): void {
  const book = program.command('book').description('Manage knowledge bases (知识库)');

  const list = book
    .command('list')
    .description('List the books (知识库) of a user or group')
    .argument('<login>', 'user/group login or id')
    .option('--group', 'treat <login> as a group instead of a user')
    .option('--type <type>', 'filter by book type: Book, Design, or all')
    .option(
      '--filter-by-ability <ability>',
      'only books where the token has this ability, e.g. create_doc'
    )
    .option('--offset <n>', 'pagination offset', parseNonNegativeInt)
    .option('--limit <n>', 'page size, max 100', parseLimit)
    .option('--all', 'fetch every page (overrides --offset/--limit)')
    .action(
      async (
        login: string,
        opts: {
          group?: boolean;
          type?: string;
          filterByAbility?: string;
          offset?: number;
          limit?: number;
          all?: boolean;
        }
      ) => {
        const type = typeFilter(opts.type);
        const ctx = getContext(list);
        const owner: BookOwner = opts.group ? 'group' : 'user';
        const filterByAbility = opts.filterByAbility;
        const books = opts.all
          ? await fetchAllPages((offset, limit) =>
              listBooks(ctx.http, owner, login, { offset, limit, type, filterByAbility })
            )
          : await listBooks(ctx.http, owner, login, {
              offset: opts.offset,
              limit: opts.limit,
              type,
              filterByAbility,
            });
        if (ctx.json) {
          printJson(books);
          return;
        }
        printTable(books, [
          { key: 'namespace', header: 'NAMESPACE', format: bookLabel },
          { key: 'name', header: 'NAME' },
          { key: 'items_count', header: 'ITEMS' },
          { key: 'updated_at', header: 'UPDATED' },
        ]);
      }
    );

  const get = book
    .command('get')
    .description('Show the details of a book')
    .argument('<book>', 'book id or group/slug namespace')
    .action(async (bookArg: string) => {
      const ref = parseBookRef(bookArg);
      const ctx = getContext(get);
      const book = await getBook(ctx.http, ref);
      if (ctx.json) {
        printJson(book);
        return;
      }
      printRecord(book, [
        'id',
        'type',
        'namespace',
        'name',
        'slug',
        'description',
        'public',
        'items_count',
        'created_at',
        'updated_at',
      ]);
    });

  const create = book
    .command('create')
    .description('Create a book under a user or group')
    .argument('<login>', 'owner user/group login or id')
    .requiredOption('--name <name>', 'book name (required)')
    .requiredOption('--slug <slug>', 'book path (slug) (required)')
    .option('--group', 'create under a group instead of a user')
    .option('--description <description>', 'book description')
    .option('--public <n>', 'visibility: 0 private, 1 public, 2 org-only', parsePublic)
    .option('--enhanced-privacy', 'restrict access to team admins only (增强私密性)')
    .action(
      async (
        login: string,
        opts: {
          name: string;
          slug: string;
          group?: boolean;
          description?: string;
          public?: number;
          enhancedPrivacy?: boolean;
        }
      ) => {
        const ctx = getContext(create);
        const body: CreateBookBody = { name: opts.name, slug: opts.slug };
        if (opts.description !== undefined) body.description = opts.description;
        if (opts.public !== undefined) body.public = opts.public;
        if (opts.enhancedPrivacy) body.enhancedPrivacy = true;
        const book = await createBook(ctx.http, opts.group ? 'group' : 'user', login, body);
        if (ctx.json) {
          printJson(book);
          return;
        }
        printOk(`Created book ${bookLabel(book)} (id: ${book.id})`);
      }
    );

  const update = book
    .command('update')
    .description('Update the settings of a book')
    .argument('<book>', 'book id or group/slug namespace')
    .option('--name <name>', 'new name')
    .option('--slug <slug>', 'new path (slug)')
    .option('--description <description>', 'new description')
    .option('--public <n>', 'visibility: 0 private, 1 public, 2 org-only', parsePublic)
    .option('--toc <markdown>', 'replace the table of contents (Markdown list)')
    .action(
      async (
        bookArg: string,
        opts: { name?: string; slug?: string; description?: string; public?: number; toc?: string }
      ) => {
        const ref = parseBookRef(bookArg);
        const body: UpdateBookBody = {};
        if (opts.name !== undefined) body.name = opts.name;
        if (opts.slug !== undefined) body.slug = opts.slug;
        if (opts.description !== undefined) body.description = opts.description;
        if (opts.public !== undefined) body.public = opts.public;
        if (opts.toc !== undefined) body.toc = opts.toc;
        if (Object.keys(body).length === 0) {
          throw new UsageError(
            'Nothing to update — pass at least one of --name/--slug/--description/--public/--toc.'
          );
        }
        const ctx = getContext(update);
        const book = await updateBook(ctx.http, ref, body);
        if (ctx.json) {
          printJson(book);
          return;
        }
        printOk(`Updated book ${bookLabel(book)}`);
      }
    );

  const del = book
    .command('delete')
    .description('Delete a book')
    .argument('<book>', 'book id or group/slug namespace')
    .option('--yes', 'skip the confirmation prompt')
    .action(async (bookArg: string, opts: { yes?: boolean }) => {
      const ref = parseBookRef(bookArg);
      await confirmDestructive(`delete book ${bookArg}`, Boolean(opts.yes));
      const ctx = getContext(del);
      const book = await deleteBook(ctx.http, ref);
      if (ctx.json) {
        printJson(book);
        return;
      }
      printOk(`Deleted book ${bookLabel(book)}`);
    });
}
