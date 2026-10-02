import { readFileSync } from 'node:fs'
import path from 'node:path'

import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { abrirSessao } from './sessao'

/**
 * A importação de ponta a ponta (doc 06, CSV-I1 a CSV-I9), pelo caminho de
 * produção: as Server Actions com sessão de verdade, os bytes das fixtures,
 * e o `compute_import_diff` e o `apply_import` reais no banco.
 */

const estado = vi.hoisted(() => ({ cookies: null as unknown }))
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(estado.cookies) }))
const updateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ updateTag }))

const { db } = await import('@/db/client')
const {
  auditLogs,
  certificateTemplates,
  certificates,
  events,
  importBatches,
  importRows,
  participants,
  participationTypes,
} = await import('@/db/schema')
const { createEvent } = await import('@/actions/events')
const { createTemplate } = await import('@/actions/templates')
const {
  applyImport,
  discardImport,
  inspectCsv,
  listImportRows,
  resolveImportRow,
  stageImport,
} = await import('@/actions/imports')

const NOMES = [
  'José Gonçalves de Assunção',
  'Maria Eduarda dos Santos Albuquerque',
  'Ângela Muñoz Ñandú',
  'João Pedro da Silva',
  'Ana-Clara D’Ávila',
  'Conceição Araújo Lima',
  'Luís Antônio Gonçalves',
]

const criados: string[] = []

beforeAll(async () => {
  estado.cookies = await abrirSessao('editor')
})

afterAll(async () => {
  await db().delete(certificates).where(inArray(certificates.eventId, criados))
  await db().delete(participants).where(inArray(participants.eventId, criados))
  await db().delete(events).where(inArray(events.id, criados))
})

// --- Apoio ------------------------------------------------------------------

type Arquivo = { nome: string; bytes: Uint8Array }

const fixture = (nome: string): Arquivo => ({
  nome,
  bytes: new Uint8Array(
    readFileSync(path.resolve(process.cwd(), 'tests/fixtures/csv', nome)),
  ),
})

const textoUtf8 = (nome: string, conteudo: string): Arquivo => ({
  nome,
  bytes: new TextEncoder().encode(conteudo),
})

/** Evento com busca por CPF e o tipo participante ligado a um modelo vazio. */
async function novoEvento() {
  const evento = await createEvent({
    title: `Importação ${Date.now()}`,
    startsAt: '2027-03-10T19:00',
  })
  if (!evento.ok) throw new Error(evento.error.message)
  criados.push(evento.data.id)
  const modelo = await createTemplate({ eventId: evento.data.id, name: 'Participantes' })
  if (!modelo.ok) throw new Error(modelo.error.message)
  const [tipo] = await db()
    .update(participationTypes)
    .set({ certificateTemplateId: modelo.data.id })
    .where(
      and(
        eq(participationTypes.eventId, evento.data.id),
        eq(participationTypes.slug, 'participante'),
      ),
    )
    .returning({ id: participationTypes.id })
  await db()
    .update(events)
    .set({ searchByCpf: true })
    .where(eq(events.id, evento.data.id))
  return { eventoId: evento.data.id, slug: evento.data.slug, tipoId: tipo!.id }
}

function formulario(arquivo: Arquivo, campos: Record<string, string>) {
  const dados = new FormData()
  // A cópia tem um ArrayBuffer de verdade por baixo, que é o que o File aceita.
  dados.set('file', new File([new Uint8Array(arquivo.bytes)], arquivo.nome))
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor)
  return dados
}

/** Inspeção e prévia com o mapeamento sugerido (ou o dado). */
async function previa(
  evento: { eventoId: string; tipoId: string },
  arquivo: Arquivo,
  ajustar: (sugerido: Record<string, string>) => Record<string, string> = (m) => m,
) {
  const campos = { eventId: evento.eventoId, participationTypeId: evento.tipoId }
  const inspecao = await inspectCsv(formulario(arquivo, campos))
  if (!inspecao.ok)
    throw new Error(`inspeção: ${inspecao.error.code} ${inspecao.error.message}`)
  const mapping = ajustar(inspecao.data.suggestedMapping as Record<string, string>)
  const prev = await stageImport(
    formulario(arquivo, { ...campos, mapping: JSON.stringify(mapping) }),
  )
  if (!prev.ok) throw new Error(`prévia: ${prev.error.code} ${prev.error.message}`)
  return prev.data
}

async function aplicar(batchId: string, previewDigest: string) {
  const resultado = await applyImport({ batchId, previewDigest })
  if (!resultado.ok) throw new Error(`aplicação: ${resultado.error.code}`)
  return resultado.data
}

function digitos(base: string) {
  const calcular = (parcial: string) => {
    const soma = [...parcial].reduce(
      (s, d, i) => s + Number(d) * (parcial.length + 1 - i),
      0,
    )
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  const d1 = calcular(base)
  return `${base}${d1}${calcular(base + d1)}`
}

/** Planilha sintética de `n` pessoas, cada uma com CPF válido e nome único. */
function planilhaGrande(n: number, cpfInvalidoNa?: number): Arquivo {
  const linhas = ['Nome;CPF']
  for (let i = 1; i <= n; i++) {
    const cpf =
      i === cpfInvalidoNa ? '529.982.247-24' : digitos(String(300_000_000 + i * 7_919))
    linhas.push(`Participante Numero ${i} Teste;${cpf}`)
  }
  return textoUtf8('grande.csv', linhas.join('\r\n') + '\r\n')
}

const nomesDoEvento = async (eventoId: string) =>
  (
    await db()
      .select({ nome: participants.fullName })
      .from(participants)
      .where(eq(participants.eventId, eventoId))
  )
    .map((linha) => linha.nome)
    .sort()

// --- CSV-I1 e I2 --------------------------------------------------------------

describe('a planilha principal', () => {
  let evento: Awaited<ReturnType<typeof novoEvento>>

  beforeAll(async () => {
    evento = await novoEvento()
  })

  it('CSV-I1: Excel pt-BR de ponta a ponta, com os acentos certos no banco', async () => {
    const inicio = new Date()
    const arquivo = fixture('excel-ptbr-cp1252-semicolon.csv')
    const inspecao = await inspectCsv(
      formulario(arquivo, {
        eventId: evento.eventoId,
        participationTypeId: evento.tipoId,
      }),
    )
    expect(inspecao).toMatchObject({
      ok: true,
      data: {
        encoding: 'windows-1252',
        delimiter: ';',
        rowCount: 7,
        suggestedMapping: {
          full_name: 'Nome completo',
          cpf: 'CPF',
          birth_date: 'Data de nascimento',
          email: 'E-mail',
          hours: 'Carga horária',
        },
        warnings: [],
      },
    })

    const { batchId, summary, previewDigest } = await previa(evento, arquivo)
    expect(summary).toMatchObject({
      create: 7,
      update: 0,
      error: 0,
      needs_decision: 0,
      new_people: 7,
    })
    expect(await aplicar(batchId, previewDigest)).toMatchObject({ status: 'applied' })

    expect(await nomesDoEvento(evento.eventoId)).toEqual([...NOMES].sort())
    const [angela] = await db()
      .select({ horas: certificates.hours, ultimos: participants.cpfLast3 })
      .from(certificates)
      .innerJoin(participants, eq(participants.id, certificates.participantId))
      .where(eq(participants.fullName, 'Ângela Muñoz Ñandú'))
    expect(angela).toMatchObject({ horas: '4.5' })
    expect(updateTag).toHaveBeenCalledWith(`event:${evento.slug}`)

    // A inspeção só lê: por exceção documentada no doc 07, não audita.
    const inspecoes = await db()
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.action, 'import.inspect'), gte(auditLogs.createdAt, inicio)),
      )
    expect(inspecoes).toEqual([])
  })

  it('CSV-I2: o mesmo arquivo de novo dá 0 a criar e 0 a atualizar, e a inspeção avisa', async () => {
    const arquivo = fixture('excel-ptbr-cp1252-semicolon.csv')
    const inspecao = await inspectCsv(
      formulario(arquivo, {
        eventId: evento.eventoId,
        participationTypeId: evento.tipoId,
      }),
    )
    expect(inspecao.ok && inspecao.data.warnings.map((aviso) => aviso.code)).toEqual([
      'ALREADY_APPLIED',
    ])

    const { summary } = await previa(evento, arquivo)
    expect(summary).toMatchObject({ create: 0, update: 0, unchanged: 7 })
  })

  it('nome corrigido casa por CPF e vira atualização, com o antes e o depois', async () => {
    const { batchId, summary, previewDigest } = await previa(
      evento,
      fixture('reimport-name-fixed.csv'),
    )
    expect(summary).toMatchObject({ create: 0, update: 1, unchanged: 6 })

    const lista = await listImportRows({ batchId, filter: 'update' })
    expect(lista.ok && lista.data.rows).toEqual([
      expect.objectContaining({
        rowNumber: 7,
        matchRule: 'cpf',
        fullName: 'Conceição Araújo Lima Souza',
        before: expect.objectContaining({ fullName: 'Conceição Araújo Lima' }),
      }),
    ])

    await aplicar(batchId, previewDigest)
    const [conceicao] = await db()
      .select({ versao: certificates.version })
      .from(certificates)
      .innerJoin(participants, eq(participants.id, certificates.participantId))
      .where(eq(participants.fullName, 'Conceição Araújo Lima Souza'))
    expect(conceicao?.versao).toBe(2)
  })

  it('a planilha sem CPF e depois com CPF: casa por nome e nascimento e ganha o CPF', async () => {
    const outro = await novoEvento()
    const semCpf = await previa(
      outro,
      fixture('excel-ptbr-cp1252-semicolon.csv'),
      ({ cpf: _, ...resto }) => resto,
    )
    await aplicar(semCpf.batchId, semCpf.previewDigest)

    const comCpf = await previa(outro, fixture('reimport-cpf-added.csv'))
    expect(comCpf.summary).toMatchObject({ create: 0, update: 7, new_people: 0 })
    await aplicar(comCpf.batchId, comCpf.previewDigest)
    const semHash = await db()
      .select({ id: participants.id })
      .from(participants)
      .where(
        and(
          eq(participants.eventId, outro.eventoId),
          sql`${participants.cpfHash} is null`,
        ),
      )
    expect(semHash).toEqual([])
  })
})

/// --- Preset ------------------------------------------------------------------

describe('o preset do modelo', () => {
  it('o mapeamento confirmado vira preset, e vence o sinônimo no arquivo seguinte', async () => {
    const evento = await novoEvento()
    // "Nome" é o do crachá; o nome completo vem de "Nome civil".
    const arquivo = textoUtf8(
      'cracha.csv',
      'Nome;Nome civil;E-mail\r\nAna;Ana Lima Souza;ana@exemplo.org\r\n',
    )
    const primeira = await inspectCsv(
      formulario(arquivo, {
        eventId: evento.eventoId,
        participationTypeId: evento.tipoId,
      }),
    )
    // Sem preset, a tela diz que a sugestão veio da semelhança (doc 03, 6f).
    expect(primeira.ok && primeira.data.presetApplied).toBe(false)
    await previa(evento, arquivo, (sugerido) => ({
      ...sugerido,
      full_name: 'Nome civil',
    }))

    const [modelo] = await db()
      .select({ preset: certificateTemplates.columnMapping })
      .from(certificateTemplates)
      .innerJoin(
        participationTypes,
        eq(participationTypes.certificateTemplateId, certificateTemplates.id),
      )
      .where(eq(participationTypes.id, evento.tipoId))
    expect(modelo?.preset).toEqual({ full_name: 'nome civil', email: 'e mail' })

    const deNovo = await inspectCsv(
      formulario(arquivo, {
        eventId: evento.eventoId,
        participationTypeId: evento.tipoId,
      }),
    )
    expect(deNovo.ok && deNovo.data.suggestedMapping).toEqual({
      full_name: 'Nome civil',
      email: 'E-mail',
    })
    expect(deNovo.ok && deNovo.data.presetApplied).toBe(true)
  })
})

/// --- Nome que não cabe ---------------------------------------------------------

describe('LAYOUT_BELOW_MIN_SIZE', () => {
  it('a prévia mede o nome no modelo do tipo, com as fontes de verdade', async () => {
    const evento = await novoEvento()
    const [tipo] = await db()
      .select({ modelo: participationTypes.certificateTemplateId })
      .from(participationTypes)
      .where(eq(participationTypes.id, evento.tipoId))
    await db()
      .update(certificateTemplates)
      .set({
        pages: [{ width_pt: 841.89, height_pt: 595.28, preview_path: null }],
        layoutFields: [
          {
            id: 'nome',
            kind: 'text',
            page: 1,
            // Uns 250 pt de largura e uma linha só.
            box: { x: 0.35, y: 0.4, w: 0.3, h: 0.06 },
            content: '{{participant.full_name}}',
            font: 'curated:poppins-600',
            size_pt: 24,
            min_size_pt: 16,
            color: '#1E1E1E',
            h_align: 'center',
            v_align: 'middle',
            line_height: 1.15,
            max_lines: 1,
            fit: 'shrink_then_wrap',
            transform: 'none',
          },
        ],
      })
      .where(eq(certificateTemplates.id, tipo!.modelo!))

    const arquivo = textoUtf8(
      'nomes.csv',
      'Nome;CPF\r\nAna Lima;\r\nMaria Eduarda dos Santos Albuquerque Pessoa Rodrigues Vasconcelos;\r\n',
    )
    const { batchId, summary } = await previa(evento, arquivo)
    expect(summary.warnings.LAYOUT_BELOW_MIN_SIZE).toBe(1)
    const avisos = await listImportRows({ batchId, filter: 'warning' })
    const comAviso = avisos.ok
      ? avisos.data.rows.filter((linha) =>
          linha.issues.some((p) => p.code === 'LAYOUT_BELOW_MIN_SIZE'),
        )
      : []
    expect(comAviso.map((linha) => linha.rowNumber)).toEqual([3])
  })
})

// --- CSV-I3 e I4 --------------------------------------------------------------

describe('500 linhas', () => {
  it('CSV-I3: o CPF inválido aparece com o número da linha, e as outras 499 entram', async () => {
    const evento = await novoEvento()
    const { batchId, summary, previewDigest } = await previa(
      evento,
      planilhaGrande(500, 250),
    )
    expect(summary).toMatchObject({ create: 499, error: 1 })

    const erros = await listImportRows({ batchId, filter: 'error' })
    expect(erros.ok && erros.data.rows).toEqual([
      expect.objectContaining({
        rowNumber: 251,
        issues: [expect.objectContaining({ code: 'CPF_INVALID' })],
      }),
    ])
    expect(await aplicar(batchId, previewDigest)).toMatchObject({ status: 'applied' })
    expect(await nomesDoEvento(evento.eventoId)).toHaveLength(499)
  })

  it('CSV-I4: o código colide na 400ª chamada, e nada fica; o lote vira failed', async () => {
    const evento = await novoEvento()
    const { batchId, previewDigest } = await previa(evento, planilhaGrande(500))
    const [original] = await db().execute<{ definicao: string }>(
      sql`select pg_get_functiondef('public.generate_certificate_code()'::regprocedure) as definicao`,
    )
    try {
      await db().execute(sql`create sequence public.teste_colisao_de_codigo`)
      await db().execute(
        sql.raw(`create or replace function public.generate_certificate_code() returns text
          language sql volatile set search_path = '' as $$
            select case when nextval('public.teste_colisao_de_codigo') = 400
                        then (select code from public.certificates limit 1)
                        else upper(substr(md5(random()::text), 1, 10)) end $$`),
      )
      expect(await aplicar(batchId, previewDigest)).toMatchObject({ status: 'failed' })
    } finally {
      await db().execute(sql.raw(original!.definicao))
      await db().execute(sql`drop sequence if exists public.teste_colisao_de_codigo`)
    }
    expect(await nomesDoEvento(evento.eventoId)).toEqual([])
    const [lote] = await db()
      .select({ status: importBatches.status })
      .from(importBatches)
      .where(eq(importBatches.id, batchId))
    expect(lote?.status).toBe('failed')
  })
})

// --- CSV-I5 a I7 --------------------------------------------------------------

describe('concorrência, prévia velha e decisões', () => {
  it('CSV-I5: duas aplicações no mesmo evento: a segunda espera o lock e recebe preview_stale', async () => {
    const evento = await novoEvento()
    const arquivo = fixture('excel-ptbr-cp1252-semicolon.csv')
    const a = await previa(evento, arquivo)
    const b = await previa(evento, arquivo)
    const resultados = await Promise.all([
      applyImport({ batchId: a.batchId, previewDigest: a.previewDigest }),
      applyImport({ batchId: b.batchId, previewDigest: b.previewDigest }),
    ])
    expect(resultados.map((r) => (r.ok ? r.data.status : r.error.code)).sort()).toEqual([
      'applied',
      'preview_stale',
    ])
    expect(await nomesDoEvento(evento.eventoId)).toHaveLength(7)
  })

  it('o mesmo lote aplicado duas vezes ao mesmo tempo: a segunda recebe batch_not_staged', async () => {
    const evento = await novoEvento()
    const a = await previa(evento, fixture('excel-ptbr-cp1252-semicolon.csv'))
    const resultados = await Promise.all([
      applyImport({ batchId: a.batchId, previewDigest: a.previewDigest }),
      applyImport({ batchId: a.batchId, previewDigest: a.previewDigest }),
    ])
    expect(resultados.map((r) => (r.ok ? r.data.status : r.error.code)).sort()).toEqual([
      'applied',
      'batch_not_staged',
    ])
  })

  it('CSV-I6: participante editado entre a prévia e a aplicação deixa a prévia velha', async () => {
    const evento = await novoEvento()
    const primeira = await previa(evento, fixture('excel-ptbr-cp1252-semicolon.csv'))
    await aplicar(primeira.batchId, primeira.previewDigest)

    const segunda = await previa(evento, fixture('excel-ptbr-cp1252-semicolon.csv'))
    await db()
      .update(participants)
      .set({ email: 'outro@exemplo.org' })
      .where(
        and(
          eq(participants.eventId, evento.eventoId),
          eq(participants.fullName, 'João Pedro da Silva'),
        ),
      )

    const velha = await aplicar(segunda.batchId, segunda.previewDigest)
    expect(velha).toMatchObject({ status: 'preview_stale', summary: { update: 1 } })
    expect(velha.previewDigest).not.toBe(segunda.previewDigest)
    expect(await aplicar(segunda.batchId, velha.previewDigest!)).toMatchObject({
      status: 'applied',
    })
  })

  it('CSV-I7: possível duplicata, nas três resoluções', async () => {
    const evento = await novoEvento()
    const base = await previa(evento, fixture('excel-ptbr-cp1252-semicolon.csv'))
    await aplicar(base.batchId, base.previewDigest)

    const duvidas = textoUtf8(
      'duvidas.csv',
      'Nome completo;CPF;Data de nascimento;E-mail\r\n' +
        // (a) mesmo e-mail do José, outro nome
        'José G. Assunção;;;jose.assuncao@exemplo.org\r\n' +
        // (b) mesmo nascimento da Maria, nome parecido
        'Maria Eduarda dos Santos Albuqerque;;03/02/2001;\r\n' +
        // (c) mesmo nome do João, CPF diferente
        `João Pedro da Silva;${digitos('864213579')};;\r\n`,
    )
    const prev = await previa(evento, duvidas)
    expect(prev.summary).toMatchObject({ needs_decision: 3 })

    let ultimo = prev
    for (const [rowNumber, resolution] of [
      [2, 'same_person'],
      [3, 'different_person'],
      [4, 'skip'],
    ] as const) {
      const decidido = await resolveImportRow({
        batchId: prev.batchId,
        rowNumber,
        resolution,
      })
      if (!decidido.ok) throw new Error(decidido.error.message)
      ultimo = { ...ultimo, ...decidido.data }
    }
    expect(ultimo.summary).toMatchObject({
      needs_decision: 0,
      update: 1,
      create: 1,
      skipped: 1,
    })
    expect(await aplicar(prev.batchId, ultimo.previewDigest)).toMatchObject({
      status: 'applied',
    })
    expect(await nomesDoEvento(evento.eventoId)).toContain('José G. Assunção')
    expect(await nomesDoEvento(evento.eventoId)).toContain(
      'Maria Eduarda dos Santos Albuqerque',
    )
  })
})

// --- Descarte, permissão e CSV-I9 -------------------------------------------

describe('descarte, papel e CPF em claro', () => {
  it('descartar apaga as linhas do staging na hora', async () => {
    const evento = await novoEvento()
    const { batchId } = await previa(evento, fixture('excel-ptbr-cp1252-semicolon.csv'))
    expect(await discardImport({ batchId })).toEqual({ ok: true, data: undefined })
    expect(
      await db().select().from(importRows).where(eq(importRows.batchId, batchId)),
    ).toEqual([])
  })

  it('leitor não importa', async () => {
    const evento = await novoEvento()
    estado.cookies = await abrirSessao('reader')
    try {
      const resultado = await inspectCsv(
        formulario(fixture('ascii-only.csv'), {
          eventId: evento.eventoId,
          participationTypeId: evento.tipoId,
        }),
      )
      expect(resultado).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    } finally {
      estado.cookies = await abrirSessao('editor')
    }
  })

  it('CSV-I9: o CPF em claro não aparece em tabela nenhuma, no log nem no navegador', async () => {
    const saidas: string[] = []
    const espioes = (['log', 'info', 'warn', 'error'] as const).map((metodo) =>
      vi.spyOn(console, metodo).mockImplementation((...args: unknown[]) => {
        saidas.push(args.map(String).join(' '))
      }),
    )
    try {
      const evento = await novoEvento()
      // O que as actions devolvem vai para o navegador do admin: a amostra da
      // inspeção (M8: saía com o CPF em claro), a prévia e a lista de linhas.
      const inspecao = await inspectCsv(
        formulario(fixture('google-sheets-utf8-comma.csv'), {
          eventId: evento.eventoId,
          participationTypeId: evento.tipoId,
        }),
      )
      const { batchId, previewDigest } = await previa(
        evento,
        fixture('google-sheets-utf8-comma.csv'),
      )
      const linhas = await listImportRows({ batchId })
      saidas.push(JSON.stringify(inspecao), JSON.stringify(linhas))
      await aplicar(batchId, previewDigest)

      const despejo = await db().execute<{ texto: string }>(sql`
        select coalesce(string_agg(t::text, ' '), '') as texto from (
          select to_jsonb(r) as t from ${importRows} r where r.batch_id = ${batchId}
          union all select to_jsonb(b) from ${importBatches} b where b.id = ${batchId}
          union all select to_jsonb(p) from ${participants} p where p.event_id = ${evento.eventoId}
          union all select to_jsonb(c) from ${certificates} c where c.event_id = ${evento.eventoId}
          union all select to_jsonb(a) from ${auditLogs} a where a.entity_id = ${batchId}
        ) linhas`)
      const tudo = `${despejo[0]!.texto}\n${saidas.join('\n')}`
      expect(tudo).toContain('Assunção')
      expect(tudo).not.toMatch(/52998224725|529\.982\.247-25/)
    } finally {
      for (const espiao of espioes) espiao.mockRestore()
    }
  })
})
