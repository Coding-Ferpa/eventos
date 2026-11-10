import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { papelNoEventos } from '@/db/queries/users'
import { type UserRole, hasRole } from '@/lib/roles'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Leitura de sessão e papel no servidor (doc 08).
 *
 * O token só diz quem é a pessoa (`sub`). O papel vem de `eventos.profiles`,
 * e não do claim `user_role`: o Auth é do projeto que o Eventos divide com o
 * CF Jobs, e o hook de lá põe nesse claim o papel do CF Jobs (ADR-0018). Quem
 * não tem linha em `eventos.profiles` é `reader`. Uma consulta por
 * requisição, pelo `cache` do React.
 *
 * A conexão do Drizzle não carrega o JWT, então a RLS baseada na sessão não
 * protege a escrita do admin: quem protege é esta camada,
 * pelo `requireRole` das páginas e pelo `defineAction` das actions.
 */

export type CurrentUser = {
  id: string
  email: string | null
  role: UserRole
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient()

  // `getClaims` valida o token antes de devolver os claims; `getSession`
  // sozinho não serve para decisão de autorização no servidor.
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null

  const { sub, email } = data.claims

  if (typeof sub !== 'string') return null

  return {
    id: sub,
    email: typeof email === 'string' ? email : null,
    role: await papelNoEventos(sub),
  }
})

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
