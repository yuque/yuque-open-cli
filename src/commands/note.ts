import { readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { printJson, printOk, printRecord, printTable, type Column } from '../output.js';
import { fetchAllHasMorePages } from '../client/paginate.js';
import {
  createNote,
  getNote,
  listNotes,
  updateNote,
  type NoteUpdatePayload,
} from '../client/api/note.js';
import type { V2Note, V2NoteListResult } from '../client/types.js';

const NOTE_FIELDS = [
  'id',
  'slug',
  'content',
  'status',
  'tags',
  'word_count',
  'pinned_at',
  'published_at',
  'created_at',
  'updated_at',
];

const NOTE_COLUMNS: Column<V2Note>[] = [
  { key: 'id', header: 'ID' },
  {
    key: 'content',
    header: 'CONTENT',
    format: (note) => {
      const text = note.content?.source ?? note.content?.abstract ?? '';
      return text
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
    },
  },
  { key: 'word_count', header: 'WORDS' },
  { key: 'status', header: 'STATUS' },
  {
    key: 'pinned_at',
    header: 'PINNED',
    format: (note) => (note.pinned_at ? 'yes' : ''),
  },
  { key: 'updated_at', header: 'UPDATED' },
];

interface FileBackedText {
  value?: string;
  file?: string;
}

function readTextFile(path: string, flag: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UsageError(`cannot read ${flag} ${path}: ${reason}`);
  }
}

function resolveText(
  input: FileBackedText,
  valueFlag: string,
  fileFlag: string
): string | undefined {
  if (input.value !== undefined && input.file !== undefined) {
    throw new UsageError(`${valueFlag} and ${fileFlag} are mutually exclusive`);
  }
  return input.file === undefined ? input.value : readTextFile(input.file, fileFlag);
}

function positiveInt(flag: string): (value: string) => number {
  return (value) => {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new UsageError(`${flag} expects a positive integer, got "${value}"`);
    }
    return Number(value);
  };
}

function nonNegativeInt(flag: string): (value: string) => number {
  return (value) => {
    if (!/^\d+$/.test(value)) {
      throw new UsageError(`${flag} expects a non-negative integer, got "${value}"`);
    }
    return Number(value);
  };
}

function noteId(value: string): number {
  return positiveInt('note id')(value);
}

function mergeNotePages(pages: V2NoteListResult[]): V2NoteListResult {
  return {
    pin_notes: pages.flatMap((page) => page.pin_notes ?? []),
    notes: pages.flatMap((page) => page.notes ?? []),
    has_more: false,
  };
}

function renderNoteList(result: V2NoteListResult): void {
  printTable([...(result.pin_notes ?? []), ...(result.notes ?? [])], NOTE_COLUMNS);
}

interface NoteListOptions {
  status?: number;
  page?: number;
  limit?: number;
  all?: boolean;
}

interface NoteCreateOptions {
  body?: string;
  bodyFile?: string;
}

interface NoteUpdateOptions {
  source?: string;
  sourceFile?: string;
  html?: string;
  abstract?: string;
  status?: number;
}

export function registerNoteCommands(program: Command): void {
  const note = program.command('note').description('Work with notes (小记)');

  const list = note
    .command('list')
    .description('List notes for the current user')
    .option('--status <status>', 'filter by note status', nonNegativeInt('--status'))
    .option('--page <n>', 'page number', positiveInt('--page'))
    .option('--limit <n>', 'page size', positiveInt('--limit'))
    .option('--all', 'fetch every page (starts at page 1)')
    .action(async () => {
      const opts = list.opts<NoteListOptions>();
      const ctx = getContext(list);
      const result = opts.all
        ? mergeNotePages(
            await fetchAllHasMorePages((page) =>
              listNotes(ctx.http, { status: opts.status, page, limit: opts.limit })
            )
          )
        : await listNotes(ctx.http, {
            status: opts.status,
            page: opts.page,
            limit: opts.limit,
          });
      if (ctx.json) {
        printJson(result);
        return;
      }
      renderNoteList(result);
    });

  const get = note
    .command('get')
    .description('Show a note with its full content')
    .argument('<id>', 'note id', noteId)
    .action(async (id: number) => {
      const ctx = getContext(get);
      const result = await getNote(ctx.http, id);
      if (ctx.json) {
        printJson(result);
        return;
      }
      printRecord(result, NOTE_FIELDS);
    });

  const create = note
    .command('create')
    .description('Create a note')
    .option('--body <content>', 'note body in Markdown')
    .option('--body-file <path>', 'read the note body from a file')
    .action(async () => {
      const opts = create.opts<NoteCreateOptions>();
      const body = resolveText({ value: opts.body, file: opts.bodyFile }, '--body', '--body-file');
      if (body === undefined) {
        throw new UsageError(
          'a note body is required — pass --body <content> or --body-file <path>'
        );
      }
      const ctx = getContext(create);
      const result = await createNote(ctx.http, { body });
      if (ctx.json) {
        printJson(result);
        return;
      }
      printOk(
        `Created note ${result.slug ?? result.id ?? ''}${result.note_url ? `: ${result.note_url}` : ''}`
      );
    });

  const update = note
    .command('update')
    .description('Update a note')
    .argument('<id>', 'note id', noteId)
    .option('--source <markdown>', 'Markdown source')
    .option('--source-file <path>', 'read the Markdown source from a file')
    .requiredOption('--html <html>', 'HTML content')
    .requiredOption('--abstract <text>', 'content abstract')
    .option('--status <status>', 'note status', nonNegativeInt('--status'))
    .action(async (id: number, opts: NoteUpdateOptions) => {
      const source = resolveText(
        { value: opts.source, file: opts.sourceFile },
        '--source',
        '--source-file'
      );
      if (source === undefined) {
        throw new UsageError(
          'note source is required — pass --source <markdown> or --source-file <path>'
        );
      }
      const payload: NoteUpdatePayload = {
        source,
        html: opts.html as string,
        abstract: opts.abstract as string,
        ...(opts.status !== undefined && { status: opts.status }),
      };
      const ctx = getContext(update);
      const result = await updateNote(ctx.http, id, payload);
      if (ctx.json) {
        printJson(result);
        return;
      }
      printRecord(result, NOTE_FIELDS);
    });
}
