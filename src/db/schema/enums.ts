import { pgEnum } from 'drizzle-orm/pg-core'

/** Espelha os enums da migration 0002. */

export const userRole = pgEnum('user_role', ['admin', 'editor', 'reader'])

export const eventStatus = pgEnum('event_status', [
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
  'completed',
  'certificates_available',
  'archived',
])

export const searchMode = pgEnum('search_mode', ['any', 'all'])
export const templateStatus = pgEnum('template_status', ['draft', 'published'])
export const artKind = pgEnum('art_kind', ['pdf', 'image'])
export const certificateStatus = pgEnum('certificate_status', [
  'active',
  'revoked',
  'erased',
])

export const importStatus = pgEnum('import_status', [
  'staged',
  'applied',
  'discarded',
  'failed',
  'expired',
])

export const importRowAction = pgEnum('import_row_action', [
  'create',
  'update',
  'unchanged',
  'error',
  'needs_decision',
  'skipped',
])

export const correctionStatus = pgEnum('correction_status', [
  'pending',
  'approved',
  'rejected',
])

export const searchMethod = pgEnum('search_method', [
  'cpf',
  'email',
  'name',
  'all',
  'token',
  'my_certificates',
])

export const searchOutcome = pgEnum('search_outcome', [
  'found',
  'not_found',
  'ambiguous',
  'rate_limited',
  'event_unavailable',
])

export const downloadSource = pgEnum('download_source', [
  'search',
  'email_link',
  'my_certificates',
  'admin',
])

export const validationOutcome = pgEnum('validation_outcome', [
  'valid',
  'revoked',
  'erased',
  'not_found',
  'malformed',
])
