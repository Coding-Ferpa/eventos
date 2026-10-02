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

/** Apaga uma fonte enviada pelo sha256 dos bytes: a linha e o arquivo do bucket. */
export async function apagarFonteEnviada(sha256: string) {
  const sql = conectar()
  try {
    const linhas = await sql<{ storage_path: string }[]>`
      delete from public.custom_fonts where sha256 = ${sha256} returning storage_path`
    if (linhas.length === 0) return
    await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
      },
    )
      .storage.from('fonts')
      .remove(linhas.map((linha) => linha.storage_path))
  } finally {
    await sql.end()
  }
}

/**
 * Evento pronto para importar (E08 a E10, E20): busca por CPF, e participante
 * e palestrante ligados a um modelo em rascunho. Direto no banco, porque o
 * que estas E2E exercitam é a importação, e não o cadastro do evento.
 */
export async function criarEventoParaImportacao(titulo: string) {
  const sql = conectar()
  try {
    const slug = `e2e-importacao-${Date.now()}`
    const [evento] = await sql<{ id: string }[]>`
      insert into public.events (slug, title, starts_at, search_by_cpf)
      values (${slug}, ${titulo}, now() + interval '30 days', true) returning id`
    const [modelo] = await sql<{ id: string }[]>`
      insert into public.certificate_templates (event_id, name)
      values (${evento!.id}, 'Participantes') returning id`
    await sql`
      insert into public.participation_types
        (event_id, slug, label, aliases, default_hours, certificate_template_id, sort_order)
      values
        (${evento!.id}, 'participante', 'Participante', '{ouvinte}', 8, ${modelo!.id}, 1),
        (${evento!.id}, 'palestrante', 'Palestrante', '{speaker}', 2, ${modelo!.id}, 2)`
    return evento!.id
  } finally {
    await sql.end()
  }
}

/** Libera o evento e marca como baixado o certificado da pessoa (E20). */
export async function liberarComDownload(eventoId: string, nome: string) {
  const sql = conectar()
  try {
    await sql`update public.events set certificates_released_at = now() where id = ${eventoId}`
    await sql`
      update public.certificates c set first_downloaded_at = now()
        from public.participants p
       where p.id = c.participant_id and p.event_id = ${eventoId} and p.full_name = ${nome}`
  } finally {
    await sql.end()
  }
}

/** Certificado barra a remoção do evento (`on delete restrict`): sai antes. */
export async function apagarEventosComCertificados(prefixo: string) {
  const sql = conectar()
  try {
    const eventos = sql`select id from public.events where title like ${`${prefixo}%`}`
    await sql`delete from public.certificates where event_id in (${eventos})`
    await sql`delete from public.participants where event_id in (${eventos})`
    await sql`delete from public.events where title like ${`${prefixo}%`}`
  } finally {
    await sql.end()
  }
}
