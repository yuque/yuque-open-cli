import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';

type JsonObject = Record<string, unknown>;

interface IndexedOperation {
  method: string;
  operationId: string;
  pathTemplate: string;
  pathPattern: RegExp;
  literalSegmentCount: number;
  requestValidator?: ValidateFunction;
  responseValidators: Map<string, ValidateFunction>;
}

export interface SchemaRegistrySummary {
  operations: number;
  requestSchemas: number;
  responseSchemas: number;
}

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;
const SPEC_PATH = fileURLToPath(new URL('../../spec/yuque-openapi.yaml', import.meta.url));

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectProperty(value: unknown, property: string): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const result = value[property];
  return isObject(result) ? result : undefined;
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolveLocalReference(document: JsonObject, reference: string): unknown {
  if (!reference.startsWith('#/')) {
    throw new Error(`fixture schema registry only supports local $ref values, got ${reference}`);
  }

  let current: unknown = document;
  for (const rawSegment of reference.slice(2).split('/')) {
    const segment = decodeJsonPointerSegment(rawSegment);
    if (!isObject(current) || !(segment in current)) {
      throw new Error(`fixture schema registry cannot resolve ${reference}`);
    }
    current = current[segment];
  }
  return current;
}

function resolveReferencedObject(document: JsonObject, value: unknown): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const reference = value.$ref;
  if (typeof reference !== 'string') return value;
  const resolved = resolveLocalReference(document, reference);
  if (!isObject(resolved)) {
    throw new Error(`fixture schema registry expected ${reference} to resolve to an object`);
  }
  return resolved;
}

/**
 * Response and request schemas only reference components.schemas. Replacing
 * those local refs keeps each compiled Ajv schema self-contained.
 */
function dereferenceSchema(
  document: JsonObject,
  value: unknown,
  activeReferences = new Set<string>()
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => dereferenceSchema(document, item, activeReferences));
  }
  if (!isObject(value)) return value;

  const reference = value.$ref;
  if (typeof reference === 'string') {
    if (!reference.startsWith('#/components/schemas/')) {
      throw new Error(`unsupported nested fixture schema $ref: ${reference}`);
    }
    if (activeReferences.has(reference)) {
      throw new Error(`cyclic fixture schema $ref: ${reference}`);
    }

    const nextReferences = new Set(activeReferences);
    nextReferences.add(reference);
    const resolved = dereferenceSchema(
      document,
      resolveLocalReference(document, reference),
      nextReferences
    );
    if (!isObject(resolved)) {
      throw new Error(`fixture schema registry expected ${reference} to resolve to an object`);
    }

    const siblings = Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '$ref')
        .map(([key, item]) => [key, dereferenceSchema(document, item, activeReferences)])
    );
    return { ...resolved, ...siblings };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      dereferenceSchema(document, item, activeReferences),
    ])
  );
}

function jsonSchemaFromContent(value: unknown): unknown {
  const content = objectProperty(value, 'content');
  return objectProperty(content?.['application/json'], 'schema');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function compilePathTemplate(pathTemplate: string): RegExp {
  const pattern = pathTemplate
    .split('/')
    .map((segment) => (/^\{[^{}]+\}$/.test(segment) ? '[^/]+' : escapeRegExp(segment)))
    .join('/');
  return new RegExp(`^${pattern}$`);
}

function literalSegmentCount(pathTemplate: string): number {
  return pathTemplate
    .split('/')
    .filter((segment) => segment !== '' && !/^\{[^{}]+\}$/.test(segment)).length;
}

/**
 * The upstream spec declares user groups and each statistics collection as one
 * object. These are paged list endpoints and the live API returns arrays (the
 * statistics correction is also documented in src/client/api/stats.ts). Keep
 * these exceptions operation-scoped.
 */
function applyLiveApiCompatibility(operationId: string, schema: unknown): unknown {
  if (operationId === 'user_api_v2_user_group_list' && isObject(schema)) {
    const rootProperties = objectProperty(schema, 'properties');
    const itemSchema = rootProperties?.data;
    if (rootProperties === undefined || !isObject(itemSchema)) {
      throw new Error(`cannot apply live user-groups array correction to ${operationId}`);
    }
    rootProperties.data = { type: 'array', items: itemSchema };
    return schema;
  }

  const collectionByOperation: Record<string, string> = {
    statistic_api_v2_statistic_by_members: 'members',
    statistic_api_v2_statistic_by_books: 'books',
    statistic_api_v2_statistic_by_docs: 'docs',
  };
  const collection = collectionByOperation[operationId];
  if (collection === undefined || !isObject(schema)) return schema;

  const rootProperties = objectProperty(schema, 'properties');
  const dataSchema = objectProperty(rootProperties?.data, 'properties');
  const itemSchema = dataSchema?.[collection];
  if (dataSchema === undefined || !isObject(itemSchema)) {
    throw new Error(`cannot apply live statistics array correction to ${operationId}`);
  }
  dataSchema[collection] = { type: 'array', items: itemSchema };
  return schema;
}

function schemaValidationError(
  direction: 'request' | 'response',
  operation: IndexedOperation,
  path: string,
  errors: ErrorObject[] | null | undefined,
  status?: number
): Error {
  const statusDetail = status === undefined ? '' : ` (status ${status})`;
  return new Error(
    [
      `Fixture ${direction} schema validation failed for ${operation.method} ${path}${statusDetail}`,
      `operation: ${operation.operationId} (${operation.pathTemplate})`,
      `ajv errors: ${JSON.stringify(errors ?? [], null, 2)}`,
    ].join('\n')
  );
}

export class FixtureSchemaRegistry {
  readonly summary: SchemaRegistrySummary;
  private readonly operationsByMethod = new Map<string, IndexedOperation[]>();

  constructor(specPath = SPEC_PATH) {
    const parsed = load(readFileSync(specPath, 'utf8'));
    if (!isObject(parsed)) throw new Error(`expected an OpenAPI object in ${specPath}`);

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);

    const paths = objectProperty(parsed, 'paths');
    if (paths === undefined) throw new Error(`OpenAPI spec has no paths object: ${specPath}`);

    let requestSchemas = 0;
    let responseSchemas = 0;
    let operationCount = 0;

    for (const [pathTemplate, pathItem] of Object.entries(paths)) {
      if (!isObject(pathItem)) continue;
      for (const method of HTTP_METHODS) {
        const operationObject = pathItem[method];
        if (!isObject(operationObject)) continue;

        const operationId =
          typeof operationObject.operationId === 'string'
            ? operationObject.operationId
            : `${method.toUpperCase()} ${pathTemplate}`;
        const operation: IndexedOperation = {
          method: method.toUpperCase(),
          operationId,
          pathTemplate,
          pathPattern: compilePathTemplate(pathTemplate),
          literalSegmentCount: literalSegmentCount(pathTemplate),
          responseValidators: new Map(),
        };

        const requestBody = resolveReferencedObject(parsed, operationObject.requestBody);
        const requestSchema = jsonSchemaFromContent(requestBody);
        if (requestSchema !== undefined) {
          operation.requestValidator = ajv.compile(
            dereferenceSchema(parsed, requestSchema) as AnySchema
          );
          requestSchemas++;
        }

        const responses = objectProperty(operationObject, 'responses');
        if (responses !== undefined) {
          for (const [status, rawResponse] of Object.entries(responses)) {
            const response = resolveReferencedObject(parsed, rawResponse);
            const responseSchema = jsonSchemaFromContent(response);
            if (responseSchema === undefined) continue;
            const compatibleSchema = applyLiveApiCompatibility(
              operationId,
              dereferenceSchema(parsed, responseSchema)
            );
            operation.responseValidators.set(
              status.toUpperCase(),
              ajv.compile(compatibleSchema as AnySchema)
            );
            responseSchemas++;
          }
        }

        const methodOperations = this.operationsByMethod.get(operation.method) ?? [];
        methodOperations.push(operation);
        this.operationsByMethod.set(operation.method, methodOperations);
        operationCount++;
      }
    }

    for (const operations of this.operationsByMethod.values()) {
      operations.sort(
        (left, right) =>
          right.literalSegmentCount - left.literalSegmentCount ||
          right.pathTemplate.length - left.pathTemplate.length
      );
    }

    this.summary = {
      operations: operationCount,
      requestSchemas,
      responseSchemas,
    };
  }

  private findOperation(method: string, path: string): IndexedOperation | undefined {
    return this.operationsByMethod
      .get(method.toUpperCase())
      ?.find((operation) => operation.pathPattern.test(path));
  }

  validateRequest(method: string, path: string, body: unknown): boolean {
    const normalizedMethod = method.toUpperCase();
    if (normalizedMethod !== 'POST' && normalizedMethod !== 'PUT') return false;

    const operation = this.findOperation(normalizedMethod, path);
    if (operation?.requestValidator === undefined) return false;
    if (!operation.requestValidator(body)) {
      throw schemaValidationError('request', operation, path, operation.requestValidator.errors);
    }
    return true;
  }

  validateResponse(method: string, path: string, status: number, body: unknown): boolean {
    const operation = this.findOperation(method, path);
    if (operation === undefined) return false;

    const statusFamily = `${Math.trunc(status / 100)}XX`;
    const validator =
      operation.responseValidators.get(String(status)) ??
      operation.responseValidators.get(statusFamily) ??
      operation.responseValidators.get('DEFAULT');
    if (validator === undefined) return false;
    if (!validator(body)) {
      throw schemaValidationError('response', operation, path, validator.errors, status);
    }
    return true;
  }
}

let sharedRegistry: FixtureSchemaRegistry | undefined;

export function getFixtureSchemaRegistry(): FixtureSchemaRegistry {
  sharedRegistry ??= new FixtureSchemaRegistry();
  return sharedRegistry;
}
