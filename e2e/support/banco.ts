import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'

import { BUCKETS } from '@/lib/buckets'
import { arteDeExemplo, modeloDeExemplo } from '@/app/api/dev/certificado-exemplo/exemplo'
import { buildBasePdf } from '@/features/certificate/base-pdf'
import { hmacCpf } from '@/lib/hmac'

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
      select t.id from eventos.certificate_templates t
      join eventos.events e on e.id = t.event_id
      where e.title like ${`${prefixo}%`}`
    await apagarArquivosDosModelos(modelos.map((modelo) => modelo.id))
    await sql`delete from eventos.events where title like ${`${prefixo}%`}`
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
  for (const bucket of [BUCKETS.modelos, BUCKETS.previas]) {
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
      delete from eventos.custom_fonts where sha256 = ${sha256} returning storage_path`
    if (linhas.length === 0) return
    await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
      },
    )
      .storage.from(BUCKETS.fontes)
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
      insert into eventos.events (slug, title, starts_at, search_by_cpf)
      values (${slug}, ${titulo}, now() + interval '30 days', true) returning id`
    const [modelo] = await sql<{ id: string }[]>`
      insert into eventos.certificate_templates (event_id, name)
      values (${evento!.id}, 'Participantes') returning id`
    await sql`
      insert into eventos.participation_types
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
    await sql`update eventos.events set certificates_released_at = now() where id = ${eventoId}`
    await sql`
      update eventos.certificates c set first_downloaded_at = now()
        from eventos.participants p
       where p.id = c.participant_id and p.event_id = ${eventoId} and p.full_name = ${nome}`
  } finally {
    await sql.end()
  }
}

/** Certificado barra a remoção do evento (`on delete restrict`): sai antes. */
export async function apagarEventosComCertificados(prefixo: string) {
  const sql = conectar()
  try {
    const eventos = sql`select id from eventos.events where title like ${`${prefixo}%`}`
    await sql`delete from eventos.certificates where event_id in (${eventos})`
    await sql`delete from eventos.participants where event_id in (${eventos})`
    await sql`delete from eventos.events where title like ${`${prefixo}%`}`
  } finally {
    await sql.end()
  }
}

function storageAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  ).storage
}

/** As pessoas do evento liberado, com dados sintéticos (CPFs de exemplo válidos). */
export const PESSOAS = {
  jose: {
    nome: 'José Gonçalves de Assunção',
    cpf: '529.982.247-25',
    email: 'jose.e2e@example.com',
  },
  maria: {
    nome: 'Maria Eduarda dos Santos',
    cpf: '864.213.579-46',
    email: 'maria.e2e@example.com',
  },
  paulo: {
    nome: 'Paulo Henrique Brandão',
    cpf: '111.444.777-35',
    email: 'paulo.e2e@example.com',
  },
} as const

export type EventoLiberado = {
  id: string
  slug: string
  /** Código de cada certificado, por pessoa e tipo: `jose:palestrante`. */
  codigos: Record<string, string>
}

/**
 * Evento com modelo publicado de verdade (o base.pdf vai para o bucket
 * privado) e certificados ativos. Liberado, com busca por CPF, e-mail ou nome,
 * é o ponto de partida das E2E da área pública (E11 a E19, E22); sem liberar,
 * realizado e sem chave de busca, é o da liberação (E21). José é palestrante
 * e organizador (E15); Maria tem um certificado só. Cada chamada cria o seu
 * evento, para os projetos do Playwright rodarem em paralelo sem dividir
 * pessoa nem balde.
 */
export async function criarEventoComCertificados(
  prefixo: string,
  { liberado = true }: { liberado?: boolean } = {},
): Promise<EventoLiberado> {
  const sql = conectar()
  try {
    const slug = `e2e-busca-${randomUUID().slice(0, 8)}`
    const [evento] = await sql<{ id: string; salt: string }[]>`
      insert into eventos.events (
        slug, title, starts_at, ends_at, city, state, status, certificates_released_at,
        search_by_cpf, search_by_email, search_by_name, contact_email
      ) values (
        ${slug}, ${`${prefixo} ${slug}`}, '2026-09-12 11:00:00+00', '2026-09-12 21:00:00+00',
        'Fernandópolis', 'SP', ${liberado ? 'certificates_available' : 'completed'},
        ${liberado ? new Date() : null}, ${liberado}, ${liberado}, ${liberado},
        'organizacao@example.com'
      ) returning id, cpf_salt as salt`

    const base = await buildBasePdf([await arteDeExemplo()])
    const modeloId = randomUUID()
    const caminho = `${modeloId}/base.pdf`
    const { error } = await storageAdmin()
      .from(BUCKETS.modelos)
      .upload(caminho, base.bytes, { contentType: 'application/pdf' })
    if (error) throw error
    const snapshot = { ...modeloDeExemplo(base), base_pdf_path: caminho }
    await sql`
      insert into eventos.certificate_templates
        (id, event_id, name, status, version, published_snapshot, published_at)
      values (${modeloId}, ${evento!.id}, 'Modelo E2E', 'published', 1,
        ${sql.json(snapshot as never)}, now())`

    const tipos = await sql<{ id: string; slug: string }[]>`
      insert into eventos.participation_types
        (event_id, slug, label, default_hours, certificate_template_id, sort_order)
      values
        (${evento!.id}, 'participante', 'Participante', 8, ${modeloId}, 1),
        (${evento!.id}, 'palestrante', 'Palestrante', 2, ${modeloId}, 2),
        (${evento!.id}, 'organizador', 'Organizador', 16, ${modeloId}, 3)
      returning id, slug`
    const tipo = (s: string) => tipos.find((t) => t.slug === s)!.id

    const codigos: Record<string, string> = {}
    const cadastrar = async (
      chave: keyof typeof PESSOAS,
      certificados: [string, number][],
    ) => {
      const pessoa = PESSOAS[chave]
      const cpf = pessoa.cpf.replace(/\D/g, '')
      const [participante] = await sql<{ id: string }[]>`
        insert into eventos.participants (event_id, full_name, email, cpf_hash, cpf_last3)
        values (${evento!.id}, ${pessoa.nome}, ${pessoa.email},
          ${hmacCpf(process.env.CPF_PEPPER!, evento!.salt, cpf)}, ${cpf.slice(-3)})
        returning id`
      for (const [slugDoTipo, horas] of certificados) {
        const [certificado] = await sql<{ code: string }[]>`
          insert into eventos.certificates
            (event_id, participant_id, participation_type_id, hours, issued_at)
          values (${evento!.id}, ${participante!.id}, ${tipo(slugDoTipo)}, ${horas},
            ${liberado ? new Date() : null})
          returning code`
        codigos[`${chave}:${slugDoTipo}`] = certificado!.code
      }
    }
    await cadastrar('jose', [
      ['palestrante', 2],
      ['organizador', 16],
    ])
    await cadastrar('maria', [['participante', 8]])
    await cadastrar('paulo', [['participante', 8]])

    return { id: evento!.id, slug, codigos }
  } finally {
    await sql.end()
  }
}

/** Apaga um evento criado por `criarEventoComCertificados`, com o base.pdf do bucket. */
export async function apagarEventoComCertificados(id: string) {
  const sql = conectar()
  try {
    const modelos = await sql<{ id: string }[]>`
      select id from eventos.certificate_templates where event_id = ${id}`
    await sql`delete from eventos.certificates where event_id = ${id}`
    await sql`delete from eventos.events where id = ${id}`
    if (modelos.length > 0)
      await storageAdmin()
        .from(BUCKETS.modelos)
        .remove(modelos.map((modelo) => `${modelo.id}/base.pdf`))
  } finally {
    await sql.end()
  }
}

/** Revoga direto no banco, como a ação da lista faria (E19 na área pública). */
export async function revogarCertificado(codigo: string, motivo: string) {
  const sql = conectar()
  try {
    await sql`
      update eventos.certificates
         set status = 'revoked', revoked_at = now(), revoked_reason = ${motivo}
       where code = ${codigo}`
  } finally {
    await sql.end()
  }
}

/** Um IP só deste teste: os baldes do rate limit valem de verdade no build. */
export function ipDeTeste() {
  const octeto = () => Math.floor(Math.random() * 250) + 1
  return `198.18.${octeto()}.${octeto()}`
}
