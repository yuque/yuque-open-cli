import { readFileSync } from 'node:fs';
import { Option, type Command } from 'commander';
import { getContext } from '../context.js';
import { UsageError } from '../errors.js';
import { printJson, printRecord } from '../output.js';
import {
  createResource,
  getResource,
  updateResource,
  type ResourceLocator,
} from '../client/api/resource.js';
import type { V2BoardDsl, V2BoardType, V2ResourceResult } from '../client/types.js';

const RESOURCE_FIELDS = ['doc_id', 'title', 'url', 'updated_at', 'board'];

interface LocatorOptions {
  docId?: number;
  url?: string;
}

interface DslOptions {
  dsl?: string;
  dslFile?: string;
}

interface ResourceCreateOptions extends LocatorOptions, DslOptions {
  type: V2BoardType;
  insertAfterLakeId?: string;
}

interface ResourceUpdateOptions extends LocatorOptions, DslOptions {
  text?: string;
}

function positiveInt(flag: string): (value: string) => number {
  return (value) => {
    if (!/^[1-9]\d*$/.test(value)) {
      throw new UsageError(`${flag} expects a positive integer, got "${value}"`);
    }
    return Number(value);
  };
}

function validateSrc(src: string): void {
  if (src.includes('://')) {
    throw new UsageError('src must be a raw board resource id, not a board:// locator');
  }
}

function resolveLocator(opts: LocatorOptions): ResourceLocator {
  const hasDocId = opts.docId !== undefined;
  const hasUrl = opts.url !== undefined;
  if (hasDocId === hasUrl) {
    throw new UsageError('provide exactly one of --doc-id or --url');
  }
  if (opts.url !== undefined && opts.url.trim() === '') {
    throw new UsageError('--url must not be empty');
  }
  return hasDocId ? { doc_id: opts.docId } : { url: opts.url };
}

function readDslFile(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UsageError(`cannot read --dsl-file ${path}: ${reason}`);
  }
}

function resolveDsl(opts: DslOptions): string | undefined {
  if (opts.dsl !== undefined && opts.dslFile !== undefined) {
    throw new UsageError('--dsl and --dsl-file are mutually exclusive');
  }
  return opts.dslFile === undefined ? opts.dsl : readDslFile(opts.dslFile);
}

function parseDslObject(text: string): V2BoardDsl {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new UsageError(`board DSL must be a valid JSON object: ${reason}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new UsageError('board DSL must be a JSON object');
  }
  return value as V2BoardDsl;
}

function boardTypeOption(): Option {
  return new Option('--type <type>', 'board type')
    .choices(['mindmap', 'flowchart', 'architecturediagram'])
    .makeOptionMandatory();
}

function renderResource(result: V2ResourceResult): void {
  printRecord(result, RESOURCE_FIELDS);
}

function withLocatorOptions(command: Command): Command {
  return command
    .option('--doc-id <id>', 'locate the document by id', positiveInt('--doc-id'))
    .option('--url <url>', 'locate the document by URL');
}

export function registerResourceCommands(program: Command): void {
  const resource = program
    .command('resource')
    .description('Work with structured board resources (画板)');

  const get = withLocatorOptions(
    resource
      .command('get')
      .description('Show a structured board resource')
      .argument('<src>', 'raw board resource id')
  ).action(async (src: string, opts: LocatorOptions) => {
    validateSrc(src);
    const locator = resolveLocator(opts);
    const ctx = getContext(get);
    const result = await getResource(ctx.http, { resource_type: 'board', src, ...locator });
    if (ctx.json) {
      printJson(result);
      return;
    }
    renderResource(result);
  });

  const create = withLocatorOptions(
    resource
      .command('create')
      .description('Create a structured board resource')
      .addOption(boardTypeOption())
      .option('--dsl <text>', 'board text DSL')
      .option('--dsl-file <path>', 'read the board text DSL from a file')
      .option('--insert-after-lake-id <id>', 'insert after this top-level Lake node')
  ).action(async () => {
    const opts = create.opts<ResourceCreateOptions>();
    const locator = resolveLocator(opts);
    const dsl = resolveDsl(opts);
    if (dsl === undefined) {
      throw new UsageError('board DSL is required — pass --dsl <text> or --dsl-file <path>');
    }
    const ctx = getContext(create);
    const result = await createResource(ctx.http, {
      type: opts.type,
      dsl,
      ...locator,
      ...(opts.insertAfterLakeId !== undefined && {
        insert_after_lake_id: opts.insertAfterLakeId,
      }),
    });
    if (ctx.json) {
      printJson(result);
      return;
    }
    renderResource(result);
  });

  const update = withLocatorOptions(
    resource
      .command('update')
      .description('Update a structured board resource')
      .argument('<src>', 'raw board resource id')
      .option('--text <text>', 'new board text DSL')
      .option('--dsl <json>', 'board JSON DSL object')
      .option('--dsl-file <path>', 'read the board JSON DSL object from a file')
  ).action(async (src: string, opts: ResourceUpdateOptions) => {
    validateSrc(src);
    const locator = resolveLocator(opts);
    const dslText = resolveDsl(opts);
    if ((opts.text !== undefined) === (dslText !== undefined)) {
      throw new UsageError('provide exactly one of --text or --dsl/--dsl-file');
    }
    const content =
      opts.text !== undefined ? { text: opts.text } : { dsl: parseDslObject(dslText as string) };
    const ctx = getContext(update);
    const result = await updateResource(ctx.http, {
      src,
      ...locator,
      ...content,
    });
    if (ctx.json) {
      printJson(result);
      return;
    }
    renderResource(result);
  });
}
