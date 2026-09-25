import postgres from 'postgres'

/**
 * Limpeza do que as E2E criam, direto no banco local. Sem ela, cada execução
 * deixaria eventos publicados no catálogo, e a execução seguinte mediria outra
 * página.
 *
 * Recusa banco que não seja local, como a suíte de integração.
 */

try {
  process.loadEnvFile()
} catch {
  // Sem .env: as variáveis vêm do ambiente (CI).
}

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1'])

function conectar() {
  const url = process.env.DATABASE_URL
  if (!url)
    throw new Error('DATABASE_URL faltando: a limpeza das E2E precisa do banco local.')
  if (!HOSTS_LOCAIS.has(new URL(url).hostname)) {
    throw new Error('A limpeza das E2E só roda contra banco local.')
  }
  return postgres(url, { max: 1 })
}

/** Apaga os eventos cujo título começa com o prefixo, com tipos e modelos. */
export async function apagarEventosComPrefixo(prefixo: string) {
  const sql = conectar()
  try {
    await sql`delete from public.events where title like ${`${prefixo}%`}`
  } finally {
    await sql.end()
  }
}
