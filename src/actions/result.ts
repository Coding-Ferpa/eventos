/**
 * Retorno padrão das Server Actions (doc 07). Actions nunca lançam exceção
 * para o cliente: erro é dado, com código do catálogo e mensagem já em pt-BR.
 *
 * O catálogo cresce com os milestones: cada domínio acrescenta os próprios
 * códigos quando a primeira action dele existir.
 */

export type ActionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'conflict'
  // Eventos (doc 07). Os códigos de cada domínio entram com a action que os usa.
  | 'slug_locked'
  // Modelos (doc 07).
  | 'template_publish_blocked'
  | 'art_encrypted'
  | 'art_rotated'
  | 'art_too_many_pages'
  | 'art_too_small'
  | 'art_too_heavy'
  | 'art_unsupported_type'
  | 'art_unreadable'
  | 'font_variable'
  | 'font_missing_glyphs'
  // Importação (doc 07).
  | 'file_too_large'
  | 'too_many_rows'
  | 'single_column'
  | 'empty_file'
  | 'mapping_incomplete'
  | 'batch_not_staged'
  // Participantes e certificados (doc 07).
  | 'must_revoke'

export type ActionError = {
  code: ActionErrorCode
  message: string
  /** Erros por campo do formulário, no formato que o Zod devolve. */
  fieldErrors?: Record<string, string[]>
}

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: ActionError }

export function actionOk(): ActionResult
export function actionOk<T>(data: T): ActionResult<T>
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data }
}

export function actionError(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error: { code, message, fieldErrors } }
}
