import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { userRole } from './enums'

/** Espelha `profiles`, da migration 0003. O `id` é o de `auth.users`. */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  role: userRole('role').notNull().default('reader'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
