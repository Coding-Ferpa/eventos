import { hasRole, type UserRole } from '@/lib/roles'

import { actionError, type ActionResult } from './result'

/**
 * A decisão de autorização das Server Actions, separada do resto do esqueleto
 * para ser testável sem sessão, sem banco e sem Next.
 *
 * Espelha a função SQL `authorize(min_role)`: as duas precisam responder igual.
 * Esta camada dá a mensagem em pt-BR e o código do catálogo; a RLS é quem
 * garante que uma action esquecida não vire buraco.
 */

export type Sessao = { role: UserRole } | null

export function autorizar(sessao: Sessao, papelMinimo: UserRole): ActionResult | null {
  if (!sessao) {
    return actionError(
      'unauthorized',
      'Sua sessão expirou. Entre de novo para continuar.',
    )
  }

  if (!hasRole(sessao.role, papelMinimo)) {
    return actionError('forbidden', 'Seu papel não permite esta ação.')
  }

  // `null` é "pode seguir": quem chama só precisa checar se veio erro.
  return null
}
