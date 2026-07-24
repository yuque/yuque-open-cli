import axios, { type AxiosInstance } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli.js';
import {
  loadSpec,
  loadSpecOperations,
  OPERATION_TO_COMMANDS,
  type OpenApiDocument,
  type OpenApiObject,
} from './utils/spec.js';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    default: {
      ...actual.default,
      create: vi.fn(),
      isAxiosError: actual.default.isAxiosError,
    },
  };
});

type ConstraintValue = string | number | boolean;
type ConstraintLocation = 'query' | 'body';
type WireLocation = 'params' | 'data';

interface ExtractedConstraint {
  in: ConstraintLocation;
  param: string;
  required?: true;
  enum?: ConstraintValue[];
  minimum?: number;
  maximum?: number;
}

interface CliPin {
  command: string;
  flag: string;
  argsBeforeValue: string[];
  argsAfterValue: string[];
  argsWithoutValue: string[];
  wire: {
    in: WireLocation;
    param: string;
  };
  sampleValue?: ConstraintValue;
}

interface CliAlias {
  value: string;
  wireValue?: ConstraintValue;
  omitWire?: true;
}

interface ConstraintPin extends ExtractedConstraint {
  cli: CliPin | null;
  /** CLI-only accepted values and their canonical wire representation. */
  cliAliases?: CliAlias[];
  /** Alternative flags that populate the same required wire field. */
  cliAlternativeFlags?: string[];
}

function flagCli(
  command: string,
  flag: string,
  baseArgs: string[],
  wireIn: WireLocation,
  wireParam: string,
  sampleValue?: ConstraintValue
): CliPin {
  return {
    command,
    flag,
    argsBeforeValue: [...baseArgs, flag],
    argsAfterValue: [],
    argsWithoutValue: baseArgs,
    wire: { in: wireIn, param: wireParam },
    sampleValue,
  };
}

function argumentCli(
  command: string,
  argument: string,
  argsBeforeValue: string[],
  argsAfterValue: string[],
  wireIn: WireLocation,
  wireParam: string,
  sampleValue?: ConstraintValue
): CliPin {
  return {
    command,
    flag: argument,
    argsBeforeValue,
    argsAfterValue,
    argsWithoutValue: [...argsBeforeValue, ...argsAfterValue],
    wire: { in: wireIn, param: wireParam },
    sampleValue,
  };
}

/**
 * Manual, bidirectional pin of every enum/maximum/minimum/required constraint
 * found in mapped operations. Empty arrays are intentional: adding the first
 * constraint to one of those operations must also require a table update.
 */
const CONSTRAINT_PINS: Record<string, ConstraintPin[]> = {
  user_api_v2_hello: [],
  user_api_v2_user_info: [],
  user_api_v2_user_group_list: [
    {
      in: 'query',
      param: 'role',
      enum: [0, 1],
      cli: flagCli('user groups', '--role', ['user', 'groups', 'someone'], 'params', 'role'),
    },
  ],
  search_api_v2_search: [
    {
      in: 'query',
      param: 'q',
      required: true,
      cli: argumentCli('search', '<query>', ['search'], ['--type', 'doc'], 'params', 'q'),
    },
    {
      in: 'query',
      param: 'type',
      required: true,
      enum: ['doc', 'repo'],
      cli: flagCli('search', '--type', ['search', 'needle'], 'params', 'type'),
      cliAliases: [{ value: 'book', wireValue: 'repo' }],
    },
    {
      in: 'query',
      param: 'page',
      minimum: 1,
      maximum: 100,
      cli: flagCli('search', '--page', ['search', 'needle', '--type', 'doc'], 'params', 'page'),
    },
    {
      in: 'query',
      param: 'offset',
      minimum: 1,
      maximum: 100,
      cli: flagCli('search', '--offset', ['search', 'needle', '--type', 'doc'], 'params', 'offset'),
    },
  ],
  group_api_v2_group_member_list: [
    {
      in: 'query',
      param: 'role',
      enum: [0, 1, 2],
      cli: flagCli('group members', '--role', ['group', 'members', 'team'], 'params', 'role'),
    },
  ],
  group_api_v2_group_member_update: [
    {
      in: 'body',
      param: 'role',
      enum: [0, 1, 2],
      cli: flagCli(
        'group member set',
        '--role',
        ['group', 'member', 'set', 'team', 'user'],
        'data',
        'role'
      ),
    },
  ],
  group_api_v2_group_member_destroy: [],
  'doc_api_v2_doc_list-by_id': [
    {
      in: 'query',
      param: 'limit',
      maximum: 100,
      cli: flagCli('doc list', '--limit', ['doc', 'list', '1'], 'params', 'limit'),
    },
  ],
  'doc_api_v2_doc_create-by_id': [
    {
      in: 'body',
      param: 'public',
      enum: [0, 1, 2],
      cli: flagCli(
        'doc create',
        '--public',
        ['doc', 'create', '1', '--title', 'title', '--body', 'body'],
        'data',
        'public'
      ),
    },
    {
      in: 'body',
      param: 'format',
      enum: ['markdown', 'html', 'lake'],
      cli: flagCli(
        'doc create',
        '--format',
        ['doc', 'create', '1', '--title', 'title', '--body', 'body'],
        'data',
        'format'
      ),
    },
    {
      in: 'body',
      param: 'body',
      required: true,
      cli: flagCli(
        'doc create',
        '--body',
        ['doc', 'create', '1', '--title', 'title'],
        'data',
        'body'
      ),
      cliAlternativeFlags: ['--body-file'],
    },
  ],
  'doc_api_v2_doc_show-by_id': [
    {
      in: 'query',
      param: 'page_size',
      minimum: 1,
      maximum: 200,
      cli: flagCli('doc get', '--page-size', ['doc', 'get', '1'], 'params', 'page_size'),
    },
    {
      in: 'query',
      param: 'page',
      minimum: 1,
      cli: flagCli('doc get', '--page', ['doc', 'get', '1'], 'params', 'page'),
    },
  ],
  'doc_api_v2_doc_show-by_book_and_id': [
    {
      in: 'query',
      param: 'page_size',
      minimum: 1,
      maximum: 200,
      cli: flagCli('doc get', '--page-size', ['doc', 'get', '1', 'doc'], 'params', 'page_size'),
    },
    {
      in: 'query',
      param: 'page',
      minimum: 1,
      cli: flagCli('doc get', '--page', ['doc', 'get', '1', 'doc'], 'params', 'page'),
    },
  ],
  'doc_api_v2_doc_update-by_id': [
    {
      in: 'body',
      param: 'public',
      enum: [0, 1, 2],
      cli: flagCli('doc update', '--public', ['doc', 'update', '1', 'doc'], 'data', 'public'),
    },
    {
      in: 'body',
      param: 'format',
      enum: ['markdown', 'html', 'lake'],
      cli: flagCli('doc update', '--format', ['doc', 'update', '1', 'doc'], 'data', 'format'),
    },
  ],
  'doc_api_v2_doc_destroy-by_id': [],
  doc_api_v2_doc_list: [
    {
      in: 'query',
      param: 'limit',
      maximum: 100,
      cli: flagCli('doc list', '--limit', ['doc', 'list', 'team/book'], 'params', 'limit'),
    },
  ],
  doc_api_v2_doc_create: [
    {
      in: 'body',
      param: 'public',
      enum: [0, 1, 2],
      cli: flagCli(
        'doc create',
        '--public',
        ['doc', 'create', 'team/book', '--title', 'title', '--body', 'body'],
        'data',
        'public'
      ),
    },
    {
      in: 'body',
      param: 'format',
      enum: ['markdown', 'html', 'lake'],
      cli: flagCli(
        'doc create',
        '--format',
        ['doc', 'create', 'team/book', '--title', 'title', '--body', 'body'],
        'data',
        'format'
      ),
    },
    {
      in: 'body',
      param: 'body',
      required: true,
      cli: flagCli(
        'doc create',
        '--body',
        ['doc', 'create', 'team/book', '--title', 'title'],
        'data',
        'body'
      ),
      cliAlternativeFlags: ['--body-file'],
    },
  ],
  doc_api_v2_doc_show: [
    {
      in: 'query',
      param: 'page_size',
      minimum: 1,
      maximum: 200,
      cli: flagCli(
        'doc get',
        '--page-size',
        ['doc', 'get', 'team/book', 'doc'],
        'params',
        'page_size'
      ),
    },
    {
      in: 'query',
      param: 'page',
      minimum: 1,
      cli: flagCli('doc get', '--page', ['doc', 'get', 'team/book', 'doc'], 'params', 'page'),
    },
  ],
  doc_api_v2_doc_update: [
    {
      in: 'body',
      param: 'public',
      enum: [0, 1, 2],
      cli: flagCli(
        'doc update',
        '--public',
        ['doc', 'update', 'team/book', 'doc'],
        'data',
        'public'
      ),
    },
    {
      in: 'body',
      param: 'format',
      enum: ['markdown', 'html', 'lake'],
      cli: flagCli(
        'doc update',
        '--format',
        ['doc', 'update', 'team/book', 'doc'],
        'data',
        'format'
      ),
    },
  ],
  doc_api_v2_doc_destroy: [],
  doc_api_v2_doc_version_list: [
    {
      in: 'query',
      param: 'doc_id',
      required: true,
      cli: argumentCli('doc versions', '<doc-id>', ['doc', 'versions'], [], 'params', 'doc_id', 1),
    },
  ],
  doc_api_v2_doc_version_show: [],
  'doc_api_v2_repo_toc_show-by_id': [],
  'doc_api_v2_repo_toc_update-by_id': [
    {
      in: 'body',
      param: 'action',
      required: true,
      enum: ['appendNode', 'prependNode', 'editNode', 'removeNode'],
      cli: flagCli(
        'toc update',
        '--action',
        ['toc', 'update', '1', '--node-uuid', 'node'],
        'data',
        'action'
      ),
    },
    {
      in: 'body',
      param: 'action_mode',
      enum: ['sibling', 'child'],
      cli: flagCli(
        'toc update',
        '--action-mode',
        ['toc', 'update', '1', '--action', 'appendNode', '--node-uuid', 'node'],
        'data',
        'action_mode'
      ),
    },
    {
      in: 'body',
      param: 'type',
      enum: ['DOC', 'LINK', 'TITLE'],
      cli: flagCli(
        'toc update',
        '--type',
        ['toc', 'update', '1', '--action', 'appendNode', '--node-uuid', 'node'],
        'data',
        'type'
      ),
    },
    {
      in: 'body',
      param: 'open_window',
      enum: [0, 1],
      cli: flagCli(
        'toc update',
        '--open-window',
        ['toc', 'update', '1', '--action', 'appendNode', '--node-uuid', 'node'],
        'data',
        'open_window'
      ),
    },
    {
      in: 'body',
      param: 'visible',
      enum: [0, 1],
      cli: flagCli(
        'toc update',
        '--visible',
        ['toc', 'update', '1', '--action', 'appendNode', '--node-uuid', 'node'],
        'data',
        'visible'
      ),
    },
  ],
  doc_api_v2_repo_toc_show: [],
  doc_api_v2_repo_toc_update: [
    {
      in: 'body',
      param: 'action',
      required: true,
      enum: ['appendNode', 'prependNode', 'editNode', 'removeNode'],
      cli: flagCli(
        'toc update',
        '--action',
        ['toc', 'update', 'team/book', '--node-uuid', 'node'],
        'data',
        'action'
      ),
    },
    {
      in: 'body',
      param: 'action_mode',
      enum: ['sibling', 'child'],
      cli: flagCli(
        'toc update',
        '--action-mode',
        ['toc', 'update', 'team/book', '--action', 'appendNode', '--node-uuid', 'node'],
        'data',
        'action_mode'
      ),
    },
    {
      in: 'body',
      param: 'type',
      enum: ['DOC', 'LINK', 'TITLE'],
      cli: flagCli(
        'toc update',
        '--type',
        ['toc', 'update', 'team/book', '--action', 'appendNode', '--node-uuid', 'node'],
        'data',
        'type'
      ),
    },
    {
      in: 'body',
      param: 'open_window',
      enum: [0, 1],
      cli: flagCli(
        'toc update',
        '--open-window',
        ['toc', 'update', 'team/book', '--action', 'appendNode', '--node-uuid', 'node'],
        'data',
        'open_window'
      ),
    },
    {
      in: 'body',
      param: 'visible',
      enum: [0, 1],
      cli: flagCli(
        'toc update',
        '--visible',
        ['toc', 'update', 'team/book', '--action', 'appendNode', '--node-uuid', 'node'],
        'data',
        'visible'
      ),
    },
  ],
  'repo_api_v2_repo_list-by_group': [
    {
      in: 'query',
      param: 'limit',
      maximum: 100,
      cli: flagCli('book list', '--limit', ['book', 'list', 'owner', '--group'], 'params', 'limit'),
    },
    {
      in: 'query',
      param: 'type',
      enum: ['Book', 'Design'],
      cli: flagCli('book list', '--type', ['book', 'list', 'owner', '--group'], 'params', 'type'),
      cliAliases: [{ value: 'all', omitWire: true }],
    },
  ],
  'repo_api_v2_repo_create-by_group': [
    {
      in: 'body',
      param: 'name',
      required: true,
      cli: flagCli(
        'book create',
        '--name',
        ['book', 'create', 'owner', '--group', '--slug', 'slug'],
        'data',
        'name'
      ),
    },
    {
      in: 'body',
      param: 'slug',
      required: true,
      cli: flagCli(
        'book create',
        '--slug',
        ['book', 'create', 'owner', '--group', '--name', 'name'],
        'data',
        'slug'
      ),
    },
    {
      in: 'body',
      param: 'public',
      enum: [0, 1, 2],
      cli: flagCli(
        'book create',
        '--public',
        ['book', 'create', 'owner', '--group', '--name', 'name', '--slug', 'slug'],
        'data',
        'public'
      ),
    },
  ],
  repo_api_v2_repo_list: [
    {
      in: 'query',
      param: 'limit',
      maximum: 100,
      cli: flagCli('book list', '--limit', ['book', 'list', 'owner'], 'params', 'limit'),
    },
    {
      in: 'query',
      param: 'type',
      enum: ['Book', 'Design'],
      cli: flagCli('book list', '--type', ['book', 'list', 'owner'], 'params', 'type'),
      cliAliases: [{ value: 'all', omitWire: true }],
    },
  ],
  repo_api_v2_repo_create: [
    {
      in: 'body',
      param: 'name',
      required: true,
      cli: flagCli(
        'book create',
        '--name',
        ['book', 'create', 'owner', '--slug', 'slug'],
        'data',
        'name'
      ),
    },
    {
      in: 'body',
      param: 'slug',
      required: true,
      cli: flagCli(
        'book create',
        '--slug',
        ['book', 'create', 'owner', '--name', 'name'],
        'data',
        'slug'
      ),
    },
    {
      in: 'body',
      param: 'public',
      enum: [0, 1, 2],
      cli: flagCli(
        'book create',
        '--public',
        ['book', 'create', 'owner', '--name', 'name', '--slug', 'slug'],
        'data',
        'public'
      ),
    },
  ],
  'repo_api_v2_repo_show-by_id': [],
  'repo_api_v2_repo_update-by_id': [
    {
      in: 'body',
      param: 'public',
      enum: [0, 1, 2],
      cli: flagCli('book update', '--public', ['book', 'update', '1'], 'data', 'public'),
    },
  ],
  'repo_api_v2_repo_destroy-by_id': [],
  repo_api_v2_repo_show: [],
  repo_api_v2_repo_update: [
    {
      in: 'body',
      param: 'public',
      enum: [0, 1, 2],
      cli: flagCli('book update', '--public', ['book', 'update', 'team/book'], 'data', 'public'),
    },
  ],
  repo_api_v2_repo_destroy: [],
  statistic_api_v2_statistic_all: [],
  statistic_api_v2_statistic_by_members: [
    {
      in: 'query',
      param: 'range',
      enum: [0, 30, 365],
      cli: flagCli('stats members', '--range', ['stats', 'members', 'team'], 'params', 'range'),
    },
    {
      in: 'query',
      param: 'limit',
      maximum: 20,
      cli: flagCli('stats members', '--limit', ['stats', 'members', 'team'], 'params', 'limit'),
    },
    {
      in: 'query',
      param: 'sortField',
      enum: ['write_doc_count', 'write_count', 'read_count', 'like_count'],
      cli: flagCli(
        'stats members',
        '--sort-field',
        ['stats', 'members', 'team'],
        'params',
        'sortField'
      ),
    },
    {
      in: 'query',
      param: 'sortOrder',
      enum: ['desc', 'asc'],
      cli: flagCli(
        'stats members',
        '--sort-order',
        ['stats', 'members', 'team'],
        'params',
        'sortOrder'
      ),
    },
  ],
  statistic_api_v2_statistic_by_books: [
    {
      in: 'query',
      param: 'range',
      enum: [0, 30, 365],
      cli: flagCli('stats books', '--range', ['stats', 'books', 'team'], 'params', 'range'),
    },
    {
      in: 'query',
      param: 'limit',
      maximum: 20,
      cli: flagCli('stats books', '--limit', ['stats', 'books', 'team'], 'params', 'limit'),
    },
    {
      in: 'query',
      param: 'sortField',
      enum: [
        'content_updated_at_ms',
        'word_count',
        'post_count',
        'read_count',
        'like_count',
        'watch_count',
        'comment_count',
      ],
      cli: flagCli(
        'stats books',
        '--sort-field',
        ['stats', 'books', 'team'],
        'params',
        'sortField'
      ),
    },
    {
      in: 'query',
      param: 'sortOrder',
      enum: ['desc', 'asc'],
      cli: flagCli(
        'stats books',
        '--sort-order',
        ['stats', 'books', 'team'],
        'params',
        'sortOrder'
      ),
    },
  ],
  statistic_api_v2_statistic_by_docs: [
    {
      in: 'query',
      param: 'range',
      enum: [0, 30, 365],
      cli: flagCli('stats docs', '--range', ['stats', 'docs', 'team'], 'params', 'range'),
    },
    {
      in: 'query',
      param: 'limit',
      maximum: 20,
      cli: flagCli('stats docs', '--limit', ['stats', 'docs', 'team'], 'params', 'limit'),
    },
    {
      in: 'query',
      param: 'sortField',
      enum: [
        'content_updated_at',
        'word_count',
        'read_count',
        'like_count',
        'comment_count',
        'created_at',
      ],
      cli: flagCli('stats docs', '--sort-field', ['stats', 'docs', 'team'], 'params', 'sortField'),
    },
    {
      in: 'query',
      param: 'sortOrder',
      enum: ['desc', 'asc'],
      cli: flagCli('stats docs', '--sort-order', ['stats', 'docs', 'team'], 'params', 'sortOrder'),
    },
  ],
  note_api_v2_note_list: [
    {
      in: 'query',
      param: 'page',
      minimum: 1,
      cli: flagCli('note list', '--page', ['note', 'list'], 'params', 'page'),
    },
    {
      in: 'query',
      param: 'limit',
      minimum: 1,
      cli: flagCli('note list', '--limit', ['note', 'list'], 'params', 'limit'),
    },
  ],
  note_api_v2_note_create: [
    {
      in: 'body',
      param: 'body',
      required: true,
      cli: flagCli('note create', '--body', ['note', 'create'], 'data', 'body'),
      cliAlternativeFlags: ['--body-file'],
    },
  ],
  note_api_v2_note_show: [],
  note_api_v2_note_update: [
    {
      in: 'body',
      param: 'source',
      required: true,
      cli: flagCli(
        'note update',
        '--source',
        ['note', 'update', '1', '--html', '<p>x</p>', '--abstract', 'x'],
        'data',
        'source'
      ),
      cliAlternativeFlags: ['--source-file'],
    },
    {
      in: 'body',
      param: 'html',
      required: true,
      cli: flagCli(
        'note update',
        '--html',
        ['note', 'update', '1', '--source', 'x', '--abstract', 'x'],
        'data',
        'html'
      ),
    },
    {
      in: 'body',
      param: 'abstract',
      required: true,
      cli: flagCli(
        'note update',
        '--abstract',
        ['note', 'update', '1', '--source', 'x', '--html', '<p>x</p>'],
        'data',
        'abstract'
      ),
    },
  ],
  resource_api_v2_board_show: [
    {
      in: 'query',
      param: 'resource_type',
      required: true,
      enum: ['board'],
      cli: null,
    },
    {
      in: 'query',
      param: 'src',
      required: true,
      cli: argumentCli(
        'resource get',
        '<src>',
        ['resource', 'get'],
        ['--doc-id', '1'],
        'params',
        'src'
      ),
    },
    {
      in: 'query',
      param: 'doc_id',
      minimum: 1,
      cli: flagCli('resource get', '--doc-id', ['resource', 'get', 'raw-id'], 'params', 'doc_id'),
    },
  ],
  resource_api_v2_board_create: [
    {
      in: 'body',
      param: 'type',
      required: true,
      enum: ['mindmap', 'flowchart', 'architecturediagram'],
      cli: flagCli(
        'resource create',
        '--type',
        ['resource', 'create', '--doc-id', '1', '--dsl', 'root'],
        'data',
        'type'
      ),
    },
    {
      in: 'body',
      param: 'dsl',
      required: true,
      cli: flagCli(
        'resource create',
        '--dsl',
        ['resource', 'create', '--doc-id', '1', '--type', 'mindmap'],
        'data',
        'dsl'
      ),
      cliAlternativeFlags: ['--dsl-file'],
    },
    {
      in: 'body',
      param: 'doc_id',
      minimum: 1,
      cli: flagCli(
        'resource create',
        '--doc-id',
        ['resource', 'create', '--type', 'mindmap', '--dsl', 'root'],
        'data',
        'doc_id'
      ),
    },
  ],
  resource_api_v2_board_update: [
    {
      in: 'body',
      param: 'src',
      required: true,
      cli: argumentCli(
        'resource update',
        '<src>',
        ['resource', 'update'],
        ['--doc-id', '1', '--text', 'root'],
        'data',
        'src'
      ),
    },
    {
      in: 'body',
      param: 'doc_id',
      minimum: 1,
      cli: flagCli(
        'resource update',
        '--doc-id',
        ['resource', 'update', 'raw-id', '--text', 'root'],
        'data',
        'doc_id'
      ),
    },
  ],
};

function isObject(value: unknown): value is OpenApiObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Minimal internal JSON-Pointer resolver for OpenAPI 3.1 local component refs. */
function resolveRef(
  spec: OpenApiDocument,
  value: unknown,
  resolving: Set<string> = new Set()
): OpenApiObject {
  if (!isObject(value)) return {};
  const ref = value.$ref;
  if (typeof ref !== 'string') return value;
  if (!ref.startsWith('#/')) throw new Error(`Only local OpenAPI refs are supported: ${ref}`);
  if (resolving.has(ref)) throw new Error(`Circular OpenAPI ref: ${ref}`);

  const nextResolving = new Set(resolving).add(ref);
  const target = ref
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((node, part) => (isObject(node) ? node[part] : undefined), spec);
  if (!isObject(target)) throw new Error(`Unresolved OpenAPI ref: ${ref}`);

  const resolved = resolveRef(spec, target, nextResolving);
  const siblings = { ...value };
  delete siblings.$ref;
  return { ...resolved, ...siblings };
}

function addSchemaConstraints(
  spec: OpenApiDocument,
  rawSchema: unknown,
  prefix: string,
  constraints: ExtractedConstraint[]
): void {
  const schema = resolveRef(spec, rawSchema);
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((field): field is string => typeof field === 'string')
      : []
  );
  const properties = isObject(schema.properties) ? schema.properties : {};
  const fields = new Set([...Object.keys(properties), ...required]);

  for (const field of fields) {
    const property = resolveRef(spec, properties[field]);
    const param = prefix ? `${prefix}.${field}` : field;
    const constraint: ExtractedConstraint = { in: 'body', param };
    if (required.has(field)) constraint.required = true;
    if (Array.isArray(property.enum)) {
      constraint.enum = property.enum.filter(
        (value): value is ConstraintValue =>
          typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      );
    }
    if (typeof property.minimum === 'number') constraint.minimum = property.minimum;
    if (typeof property.maximum === 'number') constraint.maximum = property.maximum;
    if (Object.keys(constraint).length > 2) constraints.push(constraint);

    if (isObject(property.properties) || Array.isArray(property.required)) {
      addSchemaConstraints(spec, property, param, constraints);
    }
  }
}

function extractConstraints(spec: OpenApiDocument): Record<string, ExtractedConstraint[]> {
  const mappedOperationIds = new Set(Object.keys(OPERATION_TO_COMMANDS));
  const extracted = Object.fromEntries(
    [...mappedOperationIds].map((operationId) => [operationId, [] as ExtractedConstraint[]])
  );

  for (const { operationId, operation, pathItem } of loadSpecOperations(spec).operations) {
    if (!mappedOperationIds.has(operationId)) continue;
    const constraints = extracted[operationId];
    const pathParameters: unknown[] = Array.isArray(pathItem.parameters)
      ? (pathItem.parameters as unknown[])
      : [];
    const operationParameters: unknown[] = Array.isArray(operation.parameters)
      ? (operation.parameters as unknown[])
      : [];

    for (const rawParameter of [...pathParameters, ...operationParameters]) {
      const parameter = resolveRef(spec, rawParameter);
      if (parameter.in !== 'query' || typeof parameter.name !== 'string') continue;
      const schema = resolveRef(spec, parameter.schema);
      const constraint: ExtractedConstraint = { in: 'query', param: parameter.name };
      if (parameter.required === true) constraint.required = true;
      if (Array.isArray(schema.enum)) {
        constraint.enum = schema.enum.filter(
          (value): value is ConstraintValue =>
            typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        );
      }
      if (typeof schema.minimum === 'number') constraint.minimum = schema.minimum;
      if (typeof schema.maximum === 'number') constraint.maximum = schema.maximum;
      if (Object.keys(constraint).length > 2) constraints.push(constraint);
    }

    if (operation.requestBody !== undefined) {
      const requestBody = resolveRef(spec, operation.requestBody);
      const content = isObject(requestBody.content) ? requestBody.content : {};
      const mediaType = content['application/json'] ?? Object.values(content)[0];
      if (mediaType !== undefined) {
        const mediaTypeObject = resolveRef(spec, mediaType);
        addSchemaConstraints(spec, mediaTypeObject.schema, '', constraints);
      }
    }
  }
  return extracted;
}

function stripCliMetadata(
  pins: Record<string, ConstraintPin[]>
): Record<string, ExtractedConstraint[]> {
  return Object.fromEntries(
    Object.entries(pins).map(([operationId, constraints]) => [
      operationId,
      constraints.map((pin) => {
        const constraint: ExtractedConstraint = { in: pin.in, param: pin.param };
        if (pin.required !== undefined) constraint.required = pin.required;
        if (pin.enum !== undefined) constraint.enum = pin.enum;
        if (pin.minimum !== undefined) constraint.minimum = pin.minimum;
        if (pin.maximum !== undefined) constraint.maximum = pin.maximum;
        return constraint;
      }),
    ])
  );
}

interface NamedPin {
  operationId: string;
  pin: ConstraintPin;
}

const namedPins: NamedPin[] = Object.entries(CONSTRAINT_PINS).flatMap(
  ([operationId, constraints]) => constraints.map((pin) => ({ operationId, pin }))
);
const cliPins = namedPins.filter(
  (entry): entry is NamedPin & { pin: ConstraintPin & { cli: CliPin } } => entry.pin.cli !== null
);

function argvForValue(cli: CliPin, value: ConstraintValue): string[] {
  return ['node', 'yuque', ...cli.argsBeforeValue, String(value), ...cli.argsAfterValue];
}

function argvWithoutValue(cli: CliPin): string[] {
  return ['node', 'yuque', ...cli.argsWithoutValue];
}

function successData(url: string | undefined): unknown {
  if (url?.endsWith('/statistics/members')) return { members: [], total: 0 };
  if (url?.endsWith('/statistics/books')) return { books: [], total: 0 };
  if (url?.endsWith('/statistics/docs')) return { docs: [], total: 0 };
  return [];
}

function assertWireValue(cli: CliPin, expected: ConstraintValue): void {
  expect(request).toHaveBeenCalledTimes(1);
  const config = request.mock.calls[0][0] as Record<string, unknown>;
  expect(config[cli.wire.in]).toEqual(expect.objectContaining({ [cli.wire.param]: expected }));
}

function assertWireOmitted(cli: CliPin): void {
  expect(request).toHaveBeenCalledTimes(1);
  const config = request.mock.calls[0][0] as Record<string, unknown>;
  expect(config[cli.wire.in]).not.toHaveProperty(cli.wire.param);
}

const mockedAxios = vi.mocked(axios, { partial: true });
const request = vi.fn();

describe('spec parameter constraints contract', () => {
  it('pins every mapped operation and every extracted constraint bidirectionally', () => {
    expect(Object.keys(CONSTRAINT_PINS).sort()).toEqual(Object.keys(OPERATION_TO_COMMANDS).sort());
    expect(extractConstraints(loadSpec())).toEqual(stripCliMetadata(CONSTRAINT_PINS));
  });

  describe('CLI boundary alignment', () => {
    beforeEach(() => {
      request.mockReset();
      request.mockImplementation((config: { method?: string; url?: string }) => {
        const data = successData(config.url);
        if (config.method === 'put' && config.url?.startsWith('/notes/')) {
          return Promise.resolve({ data: { data: { data } } });
        }
        if (config.method === 'post' && config.url === '/notes') {
          return Promise.resolve({ data: { success: true, data } });
        }
        return Promise.resolve({ data: { data } });
      });
      mockedAxios.create.mockReset();
      mockedAxios.create.mockReturnValue({ request } as unknown as AxiosInstance);
      vi.stubEnv('YUQUE_TOKEN', 'test-token');
      vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it.each(cliPins.filter(({ pin }) => pin.maximum !== undefined))(
      '$operationId: $pin.cli.command $pin.cli.flag accepts maximum and rejects maximum + 1',
      async ({ pin }) => {
        const cli = pin.cli;
        const maximum = pin.maximum as number;
        await expect(runCli(argvForValue(cli, maximum))).resolves.toBe(0);
        assertWireValue(cli, maximum);

        request.mockClear();
        await expect(runCli(argvForValue(cli, maximum + 1))).resolves.toBe(2);
        expect(request).not.toHaveBeenCalled();
      }
    );

    it.each(cliPins.filter(({ pin }) => pin.minimum !== undefined))(
      '$operationId: $pin.cli.command $pin.cli.flag accepts minimum and rejects minimum - 1',
      async ({ pin }) => {
        const cli = pin.cli;
        const minimum = pin.minimum as number;
        await expect(runCli(argvForValue(cli, minimum))).resolves.toBe(0);
        assertWireValue(cli, minimum);

        request.mockClear();
        await expect(runCli(argvForValue(cli, minimum - 1))).resolves.toBe(2);
        expect(request).not.toHaveBeenCalled();
      }
    );

    it.each(
      cliPins.flatMap(({ operationId, pin }) =>
        (pin.enum ?? []).map((value) => ({ operationId, pin, value }))
      )
    )(
      '$operationId: $pin.cli.command $pin.cli.flag accepts enum value $value',
      async ({ pin, value }) => {
        const cli = pin.cli;
        await expect(runCli(argvForValue(cli, value))).resolves.toBe(0);
        assertWireValue(cli, value);
      }
    );

    it.each(cliPins.filter(({ pin }) => pin.enum !== undefined))(
      '$operationId: $pin.cli.command $pin.cli.flag rejects a value outside the enum',
      async ({ pin }) => {
        const cli = pin.cli;
        await expect(runCli(argvForValue(cli, '__outside_spec_enum__'))).resolves.toBe(2);
        expect(request).not.toHaveBeenCalled();
      }
    );

    it.each(
      cliPins.flatMap(({ operationId, pin }) =>
        (pin.cliAliases ?? []).map((alias) => ({ operationId, pin, alias }))
      )
    )(
      '$operationId: $pin.cli.command $pin.cli.flag accepts CLI alias $alias.value',
      async ({ pin, alias }) => {
        const cli = pin.cli;
        await expect(runCli(argvForValue(cli, alias.value))).resolves.toBe(0);
        if (alias.omitWire) {
          assertWireOmitted(cli);
        } else {
          assertWireValue(cli, alias.wireValue ?? alias.value);
        }
      }
    );

    it.each(cliPins.filter(({ pin }) => pin.required === true))(
      '$operationId: $pin.cli.command $pin.cli.flag is required',
      async ({ pin }) => {
        const cli = pin.cli;
        const sample = cli.sampleValue ?? pin.enum?.[0] ?? pin.minimum ?? 'pin-value';
        await expect(runCli(argvForValue(cli, sample))).resolves.toBe(0);
        assertWireValue(cli, sample);

        request.mockClear();
        await expect(runCli(argvWithoutValue(cli))).resolves.toBe(2);
        expect(request).not.toHaveBeenCalled();
      }
    );
  });
});
