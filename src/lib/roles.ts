/**
 * Papéis e hierarquia (doc 08). Espelha a função SQL `authorize(min_role)`
 * e o `role_rank` da migration 0003: as duas pontas precisam responder igual,
 * porque a UI decide o que mostrar e a RLS decide o que existe.
 *
 * Módulo puro: serve tanto ao servidor quanto a componentes de cliente.
 */

export const USER_ROLES = ['reader', 'editor', 'admin'] as const

export type UserRole = (typeof USER_ROLES)[number]

/** admin > editor > reader, com os mesmos números do `role_rank` do banco. */
const RANK: Record<UserRole, number> = {
  reader: 1,
  editor: 2,
  admin: 3,
}

export function isUserRole(value: unknown): value is UserRole {
  // `in` acharia 'constructor' e companhia na cadeia de protótipos, o que
  // transformaria um claim adulterado em papel válido.
  return typeof value === 'string' && Object.hasOwn(RANK, value)
}

/** Qualquer coisa inesperada vira `reader`: o papel que não acessa nada. */
export function parseUserRole(value: unknown): UserRole {
  return isUserRole(value) ? value : 'reader'
}

export function hasRole(role: UserRole, minimum: UserRole): boolean {
  return RANK[role] >= RANK[minimum]
}

/** Menor papel que entra no admin. `reader` existe só porque o cadastro é aberto. */
export const MIN_ADMIN_ROLE: UserRole = 'editor'

/** Como cada papel aparece na interface. */
export const ROTULO_DO_PAPEL: Record<UserRole, string> = {
  reader: 'Sem acesso',
  editor: 'Organização',
  admin: 'Administração',
}
