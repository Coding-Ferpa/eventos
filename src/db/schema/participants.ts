import { sql } from 'drizzle-orm'
import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { certificateStatus } from './enums'
import { events, participationTypes } from './events'
import { profiles } from './profiles'

/**
 * Espelha `participants` e `certificates`, da migration 0006. Pessoa e
 * documento são coisas diferentes (ADR-0004): quem a pessoa é, e o que cada
 * certificado afirma.
 */

export const participants = pgTable('participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  // Gerada pelo banco, pela mesma função da busca: a aplicação nunca escreve.
  fullNameNormalized: text('full_name_normalized')
    .notNull()
    .generatedAlwaysAs(sql`public.normalize_person_name(full_name)`),
  // Só o HMAC e os três últimos dígitos: o CPF em claro não existe (ADR-0005).
  cpfHash: text('cpf_hash'),
  cpfLast3: text('cpf_last3'),
  birthDate: date('birth_date'),
  email: text('email'),
  createdByBatchId: uuid('created_by_batch_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const certificates = pgTable('certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'restrict' }),
  // Nulo só na lápide da eliminação LGPD.
  participantId: uuid('participant_id'),
  participationTypeId: uuid('participation_type_id')
    .notNull()
    .references(() => participationTypes.id, { onDelete: 'restrict' }),

  code: text('code')
    .notNull()
    .unique()
    .default(sql`public.generate_certificate_code()`),
  // O banco não tem default para estas duas colunas: quem as preenche é o
  // trigger de inserção. O `.default` daqui existe só para o TypeScript
  // aceitar a omissão no insert, e nunca chega ao SQL: o Drizzle manda a
  // palavra `default` para coluna omitida, e o trigger decide o valor.
  sequenceNumber: integer('sequence_number')
    .notNull()
    .default(sql`null`),
  hours: numeric('hours', { precision: 5, scale: 1 })
    .notNull()
    .default(sql`null`),

  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  contentUpdatedAt: timestamp('content_updated_at', { withTimezone: true }),

  status: certificateStatus('status').notNull().default('active'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedReason: text('revoked_reason'),
  revokedBy: uuid('revoked_by').references(() => profiles.id, { onDelete: 'set null' }),

  firstDownloadedAt: timestamp('first_downloaded_at', { withTimezone: true }),
  lastDownloadedAt: timestamp('last_downloaded_at', { withTimezone: true }),
  downloadCount: integer('download_count').notNull().default(0),

  createdByBatchId: uuid('created_by_batch_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
