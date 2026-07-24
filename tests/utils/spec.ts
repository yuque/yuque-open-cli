import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

export type OpenApiObject = Record<string, unknown>;

export interface OpenApiDocument extends OpenApiObject {
  paths: Record<string, OpenApiObject>;
}

export interface OperationMapping {
  method: string;
  path: string;
  commands: string[];
}

export interface SpecOperation {
  operationId: string;
  method: string;
  path: string;
  operation: OpenApiObject;
  pathItem: OpenApiObject;
}

export interface SpecOperations {
  operations: SpecOperation[];
  /** method + path entries that declare no operationId — must stay empty. */
  missingOperationIds: string[];
}

export const OPENAPI_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;

/** operationId -> spec method + path, and the CLI command path(s) that call it. */
export const OPERATION_TO_COMMANDS: Record<string, OperationMapping> = {
  user_api_v2_hello: { method: 'get', path: '/api/v2/hello', commands: ['ping'] },
  user_api_v2_user_info: {
    method: 'get',
    path: '/api/v2/user',
    commands: ['auth status', 'user info'],
  },
  user_api_v2_user_group_list: {
    method: 'get',
    path: '/api/v2/users/{id}/groups',
    commands: ['user groups'],
  },
  search_api_v2_search: { method: 'get', path: '/api/v2/search', commands: ['search'] },
  group_api_v2_group_member_list: {
    method: 'get',
    path: '/api/v2/groups/{login}/users',
    commands: ['group members'],
  },
  group_api_v2_group_member_update: {
    method: 'put',
    path: '/api/v2/groups/{login}/users/{id}',
    commands: ['group member set'],
  },
  group_api_v2_group_member_destroy: {
    method: 'delete',
    path: '/api/v2/groups/{login}/users/{id}',
    commands: ['group member remove'],
  },
  'doc_api_v2_doc_list-by_id': {
    method: 'get',
    path: '/api/v2/repos/{book_id}/docs',
    commands: ['doc list'],
  },
  'doc_api_v2_doc_create-by_id': {
    method: 'post',
    path: '/api/v2/repos/{book_id}/docs',
    commands: ['doc create'],
  },
  'doc_api_v2_doc_show-by_id': {
    method: 'get',
    path: '/api/v2/repos/docs/{id}',
    commands: ['doc get'],
  },
  'doc_api_v2_doc_show-by_book_and_id': {
    method: 'get',
    path: '/api/v2/repos/{book_id}/docs/{id}',
    commands: ['doc get'],
  },
  'doc_api_v2_doc_update-by_id': {
    method: 'put',
    path: '/api/v2/repos/{book_id}/docs/{id}',
    commands: ['doc update'],
  },
  'doc_api_v2_doc_destroy-by_id': {
    method: 'delete',
    path: '/api/v2/repos/{book_id}/docs/{id}',
    commands: ['doc delete'],
  },
  doc_api_v2_doc_list: {
    method: 'get',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs',
    commands: ['doc list'],
  },
  doc_api_v2_doc_create: {
    method: 'post',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs',
    commands: ['doc create'],
  },
  doc_api_v2_doc_show: {
    method: 'get',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs/{id}',
    commands: ['doc get'],
  },
  doc_api_v2_doc_update: {
    method: 'put',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs/{id}',
    commands: ['doc update'],
  },
  doc_api_v2_doc_destroy: {
    method: 'delete',
    path: '/api/v2/repos/{group_login}/{book_slug}/docs/{id}',
    commands: ['doc delete'],
  },
  doc_api_v2_doc_version_list: {
    method: 'get',
    path: '/api/v2/doc_versions',
    commands: ['doc versions'],
  },
  doc_api_v2_doc_version_show: {
    method: 'get',
    path: '/api/v2/doc_versions/{id}',
    commands: ['doc version'],
  },
  'doc_api_v2_repo_toc_show-by_id': {
    method: 'get',
    path: '/api/v2/repos/{book_id}/toc',
    commands: ['toc get'],
  },
  'doc_api_v2_repo_toc_update-by_id': {
    method: 'put',
    path: '/api/v2/repos/{book_id}/toc',
    commands: ['toc update'],
  },
  doc_api_v2_repo_toc_show: {
    method: 'get',
    path: '/api/v2/repos/{group_login}/{book_slug}/toc',
    commands: ['toc get'],
  },
  doc_api_v2_repo_toc_update: {
    method: 'put',
    path: '/api/v2/repos/{group_login}/{book_slug}/toc',
    commands: ['toc update'],
  },
  'repo_api_v2_repo_list-by_group': {
    method: 'get',
    path: '/api/v2/groups/{login}/repos',
    commands: ['book list'],
  },
  'repo_api_v2_repo_create-by_group': {
    method: 'post',
    path: '/api/v2/groups/{login}/repos',
    commands: ['book create'],
  },
  repo_api_v2_repo_list: {
    method: 'get',
    path: '/api/v2/users/{login}/repos',
    commands: ['book list'],
  },
  repo_api_v2_repo_create: {
    method: 'post',
    path: '/api/v2/users/{login}/repos',
    commands: ['book create'],
  },
  'repo_api_v2_repo_show-by_id': {
    method: 'get',
    path: '/api/v2/repos/{book_id}',
    commands: ['book get'],
  },
  'repo_api_v2_repo_update-by_id': {
    method: 'put',
    path: '/api/v2/repos/{book_id}',
    commands: ['book update'],
  },
  'repo_api_v2_repo_destroy-by_id': {
    method: 'delete',
    path: '/api/v2/repos/{book_id}',
    commands: ['book delete'],
  },
  repo_api_v2_repo_show: {
    method: 'get',
    path: '/api/v2/repos/{group_login}/{book_slug}',
    commands: ['book get'],
  },
  repo_api_v2_repo_update: {
    method: 'put',
    path: '/api/v2/repos/{group_login}/{book_slug}',
    commands: ['book update'],
  },
  repo_api_v2_repo_destroy: {
    method: 'delete',
    path: '/api/v2/repos/{group_login}/{book_slug}',
    commands: ['book delete'],
  },
  statistic_api_v2_statistic_all: {
    method: 'get',
    path: '/api/v2/groups/{login}/statistics',
    commands: ['stats group'],
  },
  statistic_api_v2_statistic_by_members: {
    method: 'get',
    path: '/api/v2/groups/{login}/statistics/members',
    commands: ['stats members'],
  },
  statistic_api_v2_statistic_by_books: {
    method: 'get',
    path: '/api/v2/groups/{login}/statistics/books',
    commands: ['stats books'],
  },
  statistic_api_v2_statistic_by_docs: {
    method: 'get',
    path: '/api/v2/groups/{login}/statistics/docs',
    commands: ['stats docs'],
  },
  note_api_v2_note_list: {
    method: 'get',
    path: '/api/v2/notes',
    commands: ['note list'],
  },
  note_api_v2_note_create: {
    method: 'post',
    path: '/api/v2/notes',
    commands: ['note create'],
  },
  note_api_v2_note_show: {
    method: 'get',
    path: '/api/v2/notes/{id}',
    commands: ['note get'],
  },
  note_api_v2_note_update: {
    method: 'put',
    path: '/api/v2/notes/{id}',
    commands: ['note update'],
  },
  resource_api_v2_board_show: {
    method: 'get',
    path: '/api/v2/yfm/boards',
    commands: ['resource get'],
  },
  resource_api_v2_board_create: {
    method: 'post',
    path: '/api/v2/yfm/boards',
    commands: ['resource create'],
  },
  resource_api_v2_board_update: {
    method: 'put',
    path: '/api/v2/yfm/boards',
    commands: ['resource update'],
  },
};

export function loadSpec(): OpenApiDocument {
  const specPath = fileURLToPath(new URL('../../spec/yuque-openapi.yaml', import.meta.url));
  return load(readFileSync(specPath, 'utf8')) as OpenApiDocument;
}

export function loadSpecOperations(spec: OpenApiDocument = loadSpec()): SpecOperations {
  const operations: SpecOperation[] = [];
  const missingOperationIds: string[] = [];
  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of OPENAPI_METHODS) {
      const operation = pathItem[method] as OpenApiObject | undefined;
      if (!operation) continue;
      const operationId = operation.operationId;
      if (typeof operationId === 'string') {
        operations.push({ operationId, method, path, operation, pathItem });
      } else {
        missingOperationIds.push(`${method.toUpperCase()} ${path}`);
      }
    }
  }
  return { operations, missingOperationIds };
}
