import { sql } from 'drizzle-orm'
import {
  boolean,
  char,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { eventStatus, searchMode } from './enums'
import { profiles } from './profiles'

/**
 * Espelha `events` e `participation_types`, da migration 0004. Restrições,
 * checks e FKs compostas vivem no SQL, que é a fonte da verdade (doc 04).
 */

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  descriptionMd: text('description_md').notNull().default(''),
  coverPath: text('cover_path'),

  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  locationName: text('location_name'),
  city: text('city'),
  state: char('state', { length: 2 }),
  externalUrl: text('external_url'),

  status: eventStatus('status').notNull().default('draft'),

  searchByCpf: boolean('search_by_cpf').notNull().default(false),
  searchByEmail: boolean('search_by_email').notNull().default(false),
  searchByName: boolean('search_by_name').notNull().default(false),
  searchBirthDate: boolean('search_birth_date').notNull().default(false),
  searchMode: searchMode('search_mode').notNull().default('any'),

  // Nunca sai do servidor (ADR-0005).
  cpfSalt: text('cpf_salt')
    .notNull()
    .default(sql`encode(extensions.gen_random_bytes(16), 'hex')`),

  contactEmail: text('contact_email'),
  contactUrl: text('contact_url'),

  certificatesReleasedAt: timestamp('certificates_released_at', { withTimezone: true }),
  clonedFromEventId: uuid('cloned_from_event_id').references(
    (): AnyPgColumn => events.id,
    {
      onDelete: 'set null',
    },
  ),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const participationTypes = pgTable('participation_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  label: text('label').notNull(),
  aliases: text('aliases')
    .array()
    .notNull()
    .default(sql`'{}'`),
  // `numeric` chega do driver como texto; a conversão acontece uma vez, na
  // borda da consulta.
  defaultHours: numeric('default_hours', { precision: 5, scale: 1 }).notNull(),
  certificateTemplateId: uuid('certificate_template_id'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
