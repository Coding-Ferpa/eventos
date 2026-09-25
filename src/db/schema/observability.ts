import {
  bigint,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  downloadSource,
  eventStatus,
  searchMethod,
  searchOutcome,
  validationOutcome,
} from './enums'
import { events } from './events'
import { certificates } from './participants'
import { profiles } from './profiles'

/**
 * Espelha logs, agregado, auditoria e views da migration 0009. Nenhum destes
 * guarda dado pessoal: IP e dispositivo só entram como HMAC diário (doc 08).
 */

export const searchAttempts = pgTable('search_attempts', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
  method: searchMethod('method').notNull(),
  outcome: searchOutcome('outcome').notNull(),
  ipHash: text('ip_hash').notNull(),
  deviceHash: text('device_hash').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
})

export const certificateDownloads = pgTable('certificate_downloads', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  certificateId: uuid('certificate_id')
    .notNull()
    .references(() => certificates.id, { onDelete: 'cascade' }),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  source: downloadSource('source').notNull(),
  certificateVersion: integer('certificate_version').notNull(),
  deviceHash: text('device_hash'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
})

export const validationChecks = pgTable('validation_checks', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  certificateId: uuid('certificate_id').references(() => certificates.id, {
    onDelete: 'set null',
  }),
  outcome: validationOutcome('outcome').notNull(),
  ipHash: text('ip_hash').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
})

export const eventVisits = pgTable(
  'event_visits',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    deviceHash: text('device_hash').notNull(),
    day: date('day').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.deviceHash, table.day] })],
)

export const eventStatsDaily = pgTable(
  'event_stats_daily',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    visits: integer('visits').notNull().default(0),
    searches: integer('searches').notNull().default(0),
    searchesNotFound: integer('searches_not_found').notNull().default(0),
    firstDownloads: integer('first_downloads').notNull().default(0),
    downloads: integer('downloads').notNull().default(0),
    validations: integer('validations').notNull().default(0),
    correctionRequests: integer('correction_requests').notNull().default(0),
    pdfFailures: integer('pdf_failures').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.day] })],
)

export const auditLogs = pgTable('audit_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id'),
  diff: jsonb('diff'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Views: `.existing()` porque quem as cria é a migration, em SQL.

export const vEventSummary = pgView('v_event_summary', {
  eventId: uuid('event_id').notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  status: eventStatus('status').notNull(),
  participants: bigint('participants', { mode: 'number' }).notNull(),
  certificatesActive: bigint('certificates_active', { mode: 'number' }).notNull(),
  certificatesIssued: bigint('certificates_issued', { mode: 'number' }).notNull(),
  certificatesDownloaded: bigint('certificates_downloaded', { mode: 'number' }).notNull(),
  downloadRate: numeric('download_rate'),
  pendingCorrections: bigint('pending_corrections', { mode: 'number' }).notNull(),
  notFoundRate7d: numeric('not_found_rate_7d'),
}).existing()

export const vAdminOverview = pgView('v_admin_overview', {
  events: bigint('events', { mode: 'number' }).notNull(),
  eventsAvailable: bigint('events_available', { mode: 'number' }).notNull(),
  certificatesIssued: bigint('certificates_issued', { mode: 'number' }).notNull(),
  averageDownloadRate: numeric('average_download_rate'),
}).existing()

export const vPendingDownloads = pgView('v_pending_downloads', {
  certificateId: uuid('certificate_id').notNull(),
  eventId: uuid('event_id').notNull(),
  code: text('code').notNull(),
  participationLabel: text('participation_label').notNull(),
  fullName: text('full_name').notNull(),
  email: text('email'),
}).existing()
