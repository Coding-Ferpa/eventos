import {
  boolean,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { artKind, templateStatus } from './enums'
import { events } from './events'
import { profiles } from './profiles'

/**
 * Espelha `custom_fonts` e `certificate_templates`, da migration 0005. O
 * formato de `data_fields`, `layout_fields` e do snapshot é validado por Zod
 * no motor de certificado (doc 05), que chega no M5; aqui eles são JSON.
 */

export const customFonts = pgTable('custom_fonts', {
  id: uuid('id').primaryKey().defaultRandom(),
  family: text('family').notNull(),
  weight: smallint('weight').notNull(),
  storagePath: text('storage_path').notNull(),
  sha256: text('sha256').notNull().unique(),
  subsetOk: boolean('subset_ok').notNull(),
  glyphCoverageOk: boolean('glyph_coverage_ok').notNull(),
  uploadedBy: uuid('uploaded_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const certificateTemplates = pgTable('certificate_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: templateStatus('status').notNull().default('draft'),
  version: integer('version').notNull().default(0),

  artKind: artKind('art_kind'),
  artOriginalPath: text('art_original_path'),
  basePdfPath: text('base_pdf_path'),
  basePdfSha256: text('base_pdf_sha256'),
  basePdfSizeBytes: integer('base_pdf_size_bytes'),
  pages: jsonb('pages').$type<unknown[]>(),

  schemaVersion: smallint('schema_version').notNull().default(1),
  dataFields: jsonb('data_fields').$type<unknown[]>().notNull().default([]),
  layoutFields: jsonb('layout_fields').$type<unknown[]>().notNull().default([]),
  columnMapping: jsonb('column_mapping')
    .$type<Record<string, string>>()
    .notNull()
    .default({}),

  publishedSnapshot: jsonb('published_snapshot'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  clonedFromTemplateId: uuid('cloned_from_template_id').references(
    (): AnyPgColumn => certificateTemplates.id,
    { onDelete: 'set null' },
  ),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
