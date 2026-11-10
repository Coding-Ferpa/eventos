import { eventos } from './eventos'

/** Espelha os enums da migration 0002. */

export const userRole = eventos.enum('user_role', ['admin', 'editor', 'reader'])

export const eventStatus = eventos.enum('event_status', [
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
  'completed',
  'certificates_available',
  'archived',
])

export const searchMode = eventos.enum('search_mode', ['any', 'all'])
export const templateStatus = eventos.enum('template_status', ['draft', 'published'])
export const artKind = eventos.enum('art_kind', ['pdf', 'image'])
export const certificateStatus = eventos.enum('certificate_status', [
  'active',
  'revoked',
  'erased',
])

export const importStatus = eventos.enum('import_status', [
  'staged',
  'applied',
  'discarded',
  'failed',
  'expired',
])

export const importRowAction = eventos.enum('import_row_action', [
  'create',
  'update',
  'unchanged',
  'error',
  'needs_decision',
  'skipped',
])

export const correctionStatus = eventos.enum('correction_status', [
  'pending',
  'approved',
  'rejected',
])

export const searchMethod = eventos.enum('search_method', [
  'cpf',
  'email',
  'name',
  'all',
  'token',
  'my_certificates',
])

export const searchOutcome = eventos.enum('search_outcome', [
  'found',
  'not_found',
  'ambiguous',
  'rate_limited',
  'event_unavailable',
])

export const downloadSource = eventos.enum('download_source', [
  'search',
  'email_link',
  'my_certificates',
  'admin',
])

export const validationOutcome = eventos.enum('validation_outcome', [
  'valid',
  'revoked',
  'erased',
  'not_found',
  'malformed',
])
