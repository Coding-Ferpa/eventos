import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { correctionStatus } from './enums'
import { certificates } from './participants'
import { profiles } from './profiles'

/** Espelha `name_correction_requests`, da migration 0008. */
export const nameCorrectionRequests = pgTable('name_correction_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  certificateId: uuid('certificate_id')
    .notNull()
    .references(() => certificates.id, { onDelete: 'cascade' }),
  currentName: text('current_name').notNull(),
  requestedName: text('requested_name').notNull(),
  contact: text('contact').notNull(),
  message: text('message'),
  status: correctionStatus('status').notNull().default('pending'),
  reviewedBy: uuid('reviewed_by').references(() => profiles.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
