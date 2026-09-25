/**
 * Confere se o schema Drizzle continua espelhando o banco.
 *
 * As migrations são SQL escrito à mão (doc 04) e o schema TypeScript é
 * escrito ao lado delas: sem esta checagem, as duas descrevem realidades
 * diferentes e o erro só aparece em runtime.
 *
 * Herdado do CF Jobs, que confere só uma direção (coluna que o Drizzle conhece
 * e o banco não tem). Aqui a comparação é nas duas: coluna ou tabela que a
 * migration criou e o Drizzle não declara também falha, porque um schema que
 * esquece coluna deixa de ser espelho.
 *
 * Precisa de um banco com as migrations aplicadas (`pnpm db:reset`).
 */
import { is } from 'drizzle-orm'
import { getTableConfig, getViewConfig, PgTable, PgView } from 'drizzle-orm/pg-core'
import postgres from 'postgres'

import * as schema from '../src/db/schema'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('✖ DATABASE_URL não definida. Suba o banco com `pnpm db:start`.')
  process.exit(1)
}

type Entidade = { nome: string; colunas: string[] }

function entidadesDoDrizzle(): Entidade[] {
  return Object.values(schema).flatMap((valor): Entidade[] => {
    if (is(valor, PgTable)) {
      const config = getTableConfig(valor)
      return [{ nome: config.name, colunas: config.columns.map((c) => c.name) }]
    }
    if (is(valor, PgView)) {
      const config = getViewConfig(valor)
      return [
        {
          nome: config.name,
          colunas: Object.values(config.selectedFields).map(
            (c) => (c as { name: string }).name,
          ),
        },
      ]
    }
    return []
  })
}

async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL as string, { prepare: false, max: 1 })

  const linhas = await sql<{ table_name: string; column_name: string }[]>`
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and t.table_type in ('BASE TABLE', 'VIEW')
  `
  await sql.end()

  const noBanco = new Map<string, Set<string>>()
  for (const { table_name, column_name } of linhas) {
    if (!noBanco.has(table_name)) noBanco.set(table_name, new Set())
    noBanco.get(table_name)?.add(column_name)
  }

  const entidades = entidadesDoDrizzle()
  const problemas: string[] = []

  for (const { nome, colunas } of entidades) {
    const doBanco = noBanco.get(nome)
    if (!doBanco) {
      problemas.push(`  - ${nome}: o Drizzle declara, mas o banco não tem`)
      continue
    }
    for (const coluna of colunas) {
      if (!doBanco.has(coluna)) problemas.push(`  - ${nome}.${coluna}: só no Drizzle`)
    }
    for (const coluna of doBanco) {
      if (!colunas.includes(coluna)) problemas.push(`  - ${nome}.${coluna}: só no banco`)
    }
  }

  const declaradas = new Set(entidades.map((e) => e.nome))
  for (const nome of noBanco.keys()) {
    if (!declaradas.has(nome))
      problemas.push(`  - ${nome}: o banco tem, mas o Drizzle não declara`)
  }

  if (problemas.length > 0) {
    console.error('✖ O schema Drizzle divergiu do banco:\n')
    for (const problema of problemas) console.error(problema)
    console.error('\nAtualize src/db/schema/* ou a migration correspondente.')
    process.exit(1)
  }

  console.log(`✔ Schema Drizzle em sincronia (${entidades.length} tabelas e views).`)
}

void main()
