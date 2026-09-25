import { integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Espelha `rate_limits`, da migration 0010. A aplicação nunca lê nem escreve
 * aqui diretamente: tudo passa por `check_rate_limit` (doc 08).
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    requestCount: integer('request_count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.key, table.windowStart] })],
)
