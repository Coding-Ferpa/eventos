import 'server-only'

import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { serverEnv } from '@/lib/env'

import * as schema from './schema'

/**
 * Conexão da aplicação, pelo pooler do Supabase em modo transaction (doc 01).
 *
 * Ela autentica como `postgres`, que não passa pela RLS. É por isso que há
 * dois jeitos de usá-la (doc 08): `queryAsAnon`, para a leitura pública de
 * catálogo, em que a RLS vale; e a conexão direta, só depois de sessão e
 * papel verificados (`defineAction`, `requireRole`) ou pela consulta pública
 * de pessoa, confinada em `db/queries/public-lookup.ts` (ADR-0012).
 */

// O modo transaction do Supavisor não suporta prepared statements.
const client = postgres(serverEnv().DATABASE_URL, { prepare: false })

export const db = drizzle(client, { schema })

export type Database = typeof db
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Roda a consulta com a role `anon`, para que a RLS valha de fato (doc 01).
 *
 * A string de conexão do pooler autentica como `postgres`, que ignora RLS. Sem
 * este `set local role`, uma query pública que esquecesse o filtro de status
 * devolveria rascunho, porque a policy só protege quem chega pela role certa.
 * O custo é a transação em volta de cada leitura pública, e vale pelo que evita.
 */
export async function queryAsAnon<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role anon`)
    return run(tx)
  })
}
