import { sql } from 'drizzle-orm'
import {
  date,
  integer,
  jsonb,
  numeric,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { eventos } from './eventos'
import { importRowAction, importStatus } from './enums'
import { events, participationTypes } from './events'
import { profiles } from './profiles'

/**
 * Espelha `import_batches` e `import_rows`, da migration 0007. O arquivo CSV
 * nunca é persistido (ADR-0011): o staging guarda linha já normalizada, com o
 * CPF já em HMAC.
 */

export const importBatches = eventos.table('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  participationTypeId: uuid('participation_type_id'),
  status: importStatus('status').notNull().default('staged'),

  fileName: text('file_name'),
  fileSha256: text('file_sha256'),
  encoding: text('encoding'),
  delimiter: text('delimiter'),
  rowCount: integer('row_count').notNull().default(0),

  mapping: jsonb('mapping').$type<Record<string, string>>().notNull().default({}),
  summary: jsonb('summary').$type<Record<string, number>>().notNull().default({}),
  previewDigest: text('preview_digest'),
  errorMessage: text('error_message'),

  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type ImportRowIssue = {
  code: string
  severity: 'error' | 'warning' | 'decision'
  field?: string
  detail?: string
}

export const importRows = eventos.table(
  'import_rows',
  {
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    participationTypeId: uuid('participation_type_id').references(
      () => participationTypes.id,
      { onDelete: 'cascade' },
    ),

    fullName: text('full_name'),
    fullNameNormalized: text('full_name_normalized').generatedAlwaysAs(
      sql`eventos.normalize_person_name(full_name)`,
    ),
    cpfHash: text('cpf_hash'),
    cpfLast3: text('cpf_last3'),
    birthDate: date('birth_date'),
    email: text('email'),
    hours: numeric('hours', { precision: 5, scale: 1 }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    dataDefaults: jsonb('data_defaults')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    issues: jsonb('issues').$type<ImportRowIssue[]>().notNull().default([]),
    computedIssues: jsonb('computed_issues')
      .$type<ImportRowIssue[]>()
      .notNull()
      .default([]),
    personRow: integer('person_row'),
    action: importRowAction('action'),
    matchedParticipantId: uuid('matched_participant_id'),
    matchedCertificateId: uuid('matched_certificate_id'),
    matchRule: text('match_rule').$type<'cpf' | 'name_birth' | 'name_email' | 'name'>(),
    resolution: text('resolution').$type<'same_person' | 'different_person' | 'skip'>(),
  },
  (table) => [primaryKey({ columns: [table.batchId, table.rowNumber] })],
)
