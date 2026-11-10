import 'server-only'

import { sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { parseUserRole, type UserRole } from '@/lib/roles'

export type ContaDoAdmin = {
  id: string
  nome: string
  email: string | null
  papel: UserRole
}

/**
 * Contas com acesso ao painel e as que ainda esperam liberação. Só a página de
 * usuários chama isto, e só depois de `requireRole('admin')`: a conexão do
 * servidor lê `auth.users`, que nenhuma role pública enxerga.
 */
export async function listarContas(): Promise<ContaDoAdmin[]> {
  const linhas = await db().execute<{
    id: string
    display_name: string
    email: string | null
    role: string
  }>(sql`
    select p.id, p.display_name, u.email, p.role
      from eventos.profiles p
      join auth.users u on u.id = p.id
     order by p.role = 'reader', p.created_at
  `)

  return linhas.map((linha) => ({
    id: linha.id,
    nome: linha.display_name,
    email: linha.email,
    papel: parseUserRole(linha.role),
  }))
}
