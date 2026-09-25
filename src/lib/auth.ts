import 'server-only'

import { redirect } from 'next/navigation'

import { parseUserRole, type UserRole, hasRole } from '@/lib/roles'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Leitura de sessão e papel no servidor (doc 08).
 *
 * O papel vem do claim `user_role`, injetado no JWT pelo Custom Access Token
 * Hook, e por isso não há consulta a `profiles` aqui.
 *
 * A conexão do Drizzle não carrega o JWT, então a RLS baseada em
 * `auth.jwt()` não protege a escrita do admin: quem protege é esta camada,
 * pelo `requireRole` das páginas e pelo `defineAction` das actions.
 */

export type CurrentUser = {
  id: string
  email: string | null
  role: UserRole
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient()

  // `getClaims` valida o token antes de devolver os claims; `getSession`
  // sozinho não serve para decisão de autorização no servidor.
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null

  const { sub, email, user_role: userRole } = data.claims

  if (typeof sub !== 'string') return null

  return {
    id: sub,
    email: typeof email === 'string' ? email : null,
    role: parseUserRole(userRole),
  }
}

/**
 * Guarda de páginas do admin: manda para o login quem não entrou e para a home
 * quem entrou sem papel suficiente. Retorna o usuário para a página usar.
 */
export async function requireRole(minimum: UserRole): Promise<CurrentUser> {
  const user = await getCurrentUser()

  if (!user) redirect('/login')
  if (!hasRole(user.role, minimum)) redirect('/')

  return user
}
