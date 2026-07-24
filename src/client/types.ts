import type { components } from './types.gen.js';

type GeneratedSchema<Name extends keyof components['schemas']> = components['schemas'][Name];

/**
 * Yuque may add response fields before they appear in the vendored spec.
 * Keeping an open index preserves the complete payload for `--json` and the
 * compatibility contract of the former handwritten public types.
 */
type JsonPassthrough = { [key: string]: unknown };

type PublicSchema<Name extends keyof components['schemas']> = GeneratedSchema<Name> &
  JsonPassthrough;

type PublicSchemaWith<Name extends keyof components['schemas'], Relations> = Omit<
  GeneratedSchema<Name>,
  keyof Relations
> &
  Relations &
  JsonPassthrough;

/**
 * API response envelopes are defined inline throughout the OpenAPI paths, so
 * this generic compatibility helper cannot be extracted from one component.
 */
export type ApiEnvelope<T> = { data: T } & JsonPassthrough;

export type V2User = PublicSchema<'V2User'>;
export type V2Group = PublicSchema<'V2Group'>;
export type V2GroupUser = PublicSchemaWith<'V2GroupUser', { group?: V2Group; user?: V2User }>;
export type V2Book = PublicSchemaWith<'V2Book', { user?: V2User }>;
export type V2BookDetail = PublicSchemaWith<'V2BookDetail', { user?: V2User }>;
export type V2Doc = PublicSchemaWith<
  'V2Doc',
  { book?: V2Book; last_editor?: V2User; user?: V2User }
>;
export type V2SearchResult = PublicSchemaWith<'V2SearchResult', { target?: V2Book | V2Doc }>;

interface V2DocDetailExtensions {
  /**
   * Source: the pre-generation handwritten public contract. The sibling V2Doc
   * schema declares the same last-editor object, while the vendored
   * V2DocDetail schema currently omits it.
   */
  last_editor?: V2User;
}

export type V2DocDetail = PublicSchemaWith<
  'V2DocDetail',
  {
    book?: V2Book;
    creator?: V2User;
    user?: V2User;
  } & V2DocDetailExtensions
>;

export type V2DocVersion = PublicSchemaWith<'V2DocVersion', { user?: V2User }>;
export type V2DocVersionDetail = PublicSchemaWith<'V2DocVersionDetail', { user?: V2User }>;
export type V2TocItem = PublicSchema<'V2TocItem'>;
export type V2GroupStatistics = PublicSchema<'V2GroupStatistics'>;
export type V2MemberStatistics = PublicSchema<'V2MemberStatistics'>;
export type V2BookStatistics = PublicSchema<'V2BookStatistics'>;
export type V2DocStatistics = PublicSchema<'V2DocStatistics'>;
export type V2NoteContent = PublicSchema<'V2NoteContent'>;
export type V2Note = PublicSchemaWith<'V2Note', { content?: V2NoteContent }>;
export type V2NoteListResult = PublicSchemaWith<
  'V2NoteListResult',
  { pin_notes?: V2Note[]; notes?: V2Note[] }
>;
export type V2NoteCreateResult = PublicSchema<'V2NoteCreateResult'>;

export type V2BoardType = 'mindmap' | 'flowchart' | 'architecturediagram';
export type V2BoardJsonScalar = string | number | boolean | null;
export type V2BoardJsonValue =
  V2BoardJsonScalar | V2BoardJsonValue[] | { [key: string]: V2BoardJsonValue };
export type V2BoardDsl = Record<string, V2BoardJsonValue>;

type GeneratedResourceBoard = NonNullable<GeneratedSchema<'V2ResourceResult'>['board']>;
export type V2ResourceResult = PublicSchemaWith<
  'V2ResourceResult',
  {
    board?: Omit<GeneratedResourceBoard, 'dsl'> & { dsl?: V2BoardDsl } & JsonPassthrough;
  }
>;
