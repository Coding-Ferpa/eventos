import { createClient } from '@supabase/supabase-js'
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

/**
 * Apaga os eventos cujo título começa com o prefixo, com tipos e modelos, e
 * os arquivos que os modelos deixaram no Storage (arte, base.pdf, prévias).
 */
export async function apagarEventosComPrefixo(prefixo: string) {
  const sql = conectar()
  try {
    const modelos = await sql<{ id: string }[]>`
      select t.id from public.certificate_templates t
      join public.events e on e.id = t.event_id
      where e.title like ${`${prefixo}%`}`
    await apagarArquivosDosModelos(modelos.map((modelo) => modelo.id))
    await sql`delete from public.events where title like ${`${prefixo}%`}`
  } finally {
    await sql.end()
  }
}

async function apagarArquivosDosModelos(ids: string[]) {
  if (ids.length === 0) return
  const storage = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  ).storage
  for (const bucket of ['templates', 'previews']) {
    for (const id of ids) {
      // Cada envio é um lote numa pasta; o base.pdf fica na pasta do modelo.
      const { data: itens } = await storage.from(bucket).list(id)
      const caminhos: string[] = []
      for (const item of itens ?? []) {
        if (item.id) {
          caminhos.push(`${id}/${item.name}`)
          continue
        }
        const { data: dentro } = await storage.from(bucket).list(`${id}/${item.name}`)
        for (const arquivo of dentro ?? [])
          caminhos.push(`${id}/${item.name}/${arquivo.name}`)
      }
      if (caminhos.length > 0) await storage.from(bucket).remove(caminhos)
    }
  }
}
