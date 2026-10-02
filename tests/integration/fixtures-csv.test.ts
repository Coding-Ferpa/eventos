import { readFileSync } from 'node:fs'
import path from 'node:path'

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { abrirSessao } from './sessao'

/**
 * Cada fixture do doc 06 pelo caminho de produção: os bytes do arquivo, as
 * actions com sessão real, a validação e o diff de verdade. Só até a prévia,
 * para uma não interferir na outra.
 */

const estado = vi.hoisted(() => ({ cookies: null as unknown }))
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(estado.cookies) }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

const { db } = await import('@/db/client')
const { certificateTemplates, events, participationTypes } = await import('@/db/schema')
const { createEvent } = await import('@/actions/events')
const { createTemplate } = await import('@/actions/templates')
const { inspectCsv, listImportRows, stageImport } = await import('@/actions/imports')

const criados: string[] = []

type Evento = { eventoId: string; participante: string; palestrante: string }

/** Participante com "Registro" opcional; palestrante com o título obrigatório. */
async function novoEvento(tituloObrigatorio: boolean): Promise<Evento> {
  const evento = await createEvent({
    title: `Fixtures ${Date.now()}`,
    startsAt: '2027-03-10T19:00',
  })
  if (!evento.ok) throw new Error(evento.error.message)
  criados.push(evento.data.id)
  const modelo = async (nome: string, dataFields: unknown[]) => {
    const criado = await createTemplate({ eventId: evento.data.id, name: nome })
    if (!criado.ok) throw new Error(criado.error.message)
    await db()
      .update(certificateTemplates)
      .set({ dataFields })
      .where(eq(certificateTemplates.id, criado.data.id))
    return criado.data.id
  }
  const texto = { type: 'text', default: null, format: { type: 'text', max_length: 120 } }
  const doParticipante = await modelo('Participantes', [
    { key: 'registro', label: 'Registro', required: false, ...texto },
  ])
  const doPalestrante = await modelo(
    'Palestrantes',
    tituloObrigatorio
      ? [
          {
            key: 'titulo_palestra',
            label: 'Título da palestra',
            required: true,
            ...texto,
          },
        ]
      : [],
  )
  const tipos = await db()
    .select({ id: participationTypes.id, slug: participationTypes.slug })
    .from(participationTypes)
    .where(eq(participationTypes.eventId, evento.data.id))
  const id = (slug: string) => tipos.find((tipo) => tipo.slug === slug)!.id
  await db()
    .update(participationTypes)
    .set({ certificateTemplateId: doParticipante })
    .where(eq(participationTypes.id, id('participante')))
  await db()
    .update(participationTypes)
    .set({ certificateTemplateId: doPalestrante })
    .where(eq(participationTypes.id, id('palestrante')))
  return {
    eventoId: evento.data.id,
    participante: id('participante'),
    palestrante: id('palestrante'),
  }
}

function formulario(arquivo: string, campos: Record<string, string>) {
  const bytes = new Uint8Array(
    readFileSync(path.resolve(process.cwd(), 'tests/fixtures/csv', arquivo)),
  )
  const dados = new FormData()
  dados.set('file', new File([bytes], arquivo))
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor)
  return dados
}

async function inspecionar(evento: Evento, arquivo: string, tipoId: string | null) {
  const resultado = await inspectCsv(
    formulario(arquivo, { eventId: evento.eventoId, participationTypeId: tipoId ?? '' }),
  )
  if (!resultado.ok)
    throw new Error(`${arquivo}: ${resultado.error.code} ${resultado.error.message}`)
  return resultado.data
}

/** Prévia com o mapeamento sugerido; devolve o resumo e os códigos por linha. */
async function previa(evento: Evento, arquivo: string, tipoId: string | null) {
  const inspecao = await inspecionar(evento, arquivo, tipoId)
  const prev = await stageImport(
    formulario(arquivo, {
      eventId: evento.eventoId,
      participationTypeId: tipoId ?? '',
      mapping: JSON.stringify(inspecao.suggestedMapping),
    }),
  )
  if (!prev.ok) throw new Error(`${arquivo}: ${prev.error.code} ${prev.error.message}`)
  const lista = await listImportRows({ batchId: prev.data.batchId, limit: 100 })
  if (!lista.ok) throw new Error(lista.error.message)
  const linhas = Object.fromEntries(
    lista.data.rows.map((linha) => [linha.rowNumber, linha]),
  )
  const codigos = (n: number) => linhas[n]!.issues.map((problema) => problema.code)
  return { summary: prev.data.summary, linhas, codigos }
}

let simples: Evento
let comTitulo: Evento

beforeAll(async () => {
  estado.cookies = await abrirSessao('editor')
  simples = await novoEvento(false)
  comTitulo = await novoEvento(true)
})

afterAll(async () => {
  await db().delete(events).where(inArray(events.id, criados))
})

describe('as fixtures do doc 06, uma por uma', () => {
  it('mojibake-upstream.csv: UTF-8 válido que já chegou estragado avisa na inspeção', async () => {
    const inspecao = await inspecionar(
      simples,
      'mojibake-upstream.csv',
      simples.participante,
    )
    expect(inspecao.warnings.map((aviso) => aviso.code)).toEqual(['MOJIBAKE_SUSPECTED'])
  })

  it('quoted-delimiter-and-newline.csv: delimitador e quebra de linha dentro de aspas', async () => {
    const inspecao = await inspecionar(
      simples,
      'quoted-delimiter-and-newline.csv',
      simples.participante,
    )
    expect(inspecao).toMatchObject({ headers: ['Nome', 'Observação'], rowCount: 2 })
    expect(inspecao.sampleRows[0]).toEqual([
      'Silva; Maria',
      'primeira linha\r\nsegunda linha',
    ])
  })

  it('cpf-leading-zeros-lost.csv: os zeros que o Excel comeu voltam', async () => {
    const { summary, linhas } = await previa(
      simples,
      'cpf-leading-zeros-lost.csv',
      simples.participante,
    )
    expect(summary).toMatchObject({ create: 2, error: 0 })
    expect([linhas[2]!.cpf, linhas[3]!.cpf]).toEqual(['***.***.**7-97', '***.***.**8-90'])
  })

  it('cpf-scientific.csv: notação científica é recusada; a outra linha entra', async () => {
    const { summary, codigos } = await previa(
      simples,
      'cpf-scientific.csv',
      simples.participante,
    )
    expect(summary).toMatchObject({ create: 1, error: 1 })
    expect(codigos(2)).toEqual(['CPF_SCIENTIFIC_NOTATION'])
  })

  it('dates-mixed.csv: os cinco formatos aceitos dão a mesma data; ano com 2 dígitos é recusado', async () => {
    const { linhas, codigos } = await previa(
      simples,
      'dates-mixed.csv',
      simples.participante,
    )
    expect([2, 3, 4, 5, 6].map((n) => linhas[n]!.birthDate)).toEqual(
      Array(5).fill('1990-09-12'),
    )
    expect(codigos(7)).toContain('DATE_UNRECOGNIZED')
  })

  it('duplicates-in-file.csv: cita a linha original; a mesma pessoa em outro tipo não é duplicata', async () => {
    const { summary, linhas, codigos } = await previa(
      simples,
      'duplicates-in-file.csv',
      null,
    )
    expect(summary).toMatchObject({ create: 3, error: 1, new_people: 2 })
    expect(linhas[4]!.action).toBe('create')
    expect(codigos(5)).toEqual(['DUPLICATE_IN_FILE'])
    expect(linhas[5]!.issues[0]!.detail).toBe('Repete a linha 2.')
  })

  it('speakers-with-talk-title.csv: palestrante sem título é erro', async () => {
    const { summary, linhas } = await previa(
      comTitulo,
      'speakers-with-talk-title.csv',
      comTitulo.palestrante,
    )
    expect(summary).toMatchObject({ create: 1, error: 1 })
    expect(linhas[3]!.issues).toEqual([
      expect.objectContaining({ code: 'FIELD_REQUIRED', field: 'titulo_palestra' }),
    ])
  })

  it('mixed-types-union.csv: cada linha no modelo do seu tipo; título de participante é ignorado com aviso', async () => {
    const { summary, linhas, codigos } = await previa(
      comTitulo,
      'mixed-types-union.csv',
      null,
    )
    expect(summary).toMatchObject({ create: 3, error: 0 })
    expect(linhas[2]!.data).toEqual({ titulo_palestra: 'Git na prática' })
    expect(codigos(3)).toContain('FIELD_NOT_IN_TEMPLATE')
    expect(linhas[3]!.data).toEqual({})
  })

  it('content-looks-like-cpf.csv: CPF numa coluna de conteúdo é recusado', async () => {
    const { codigos, linhas } = await previa(
      comTitulo,
      'content-looks-like-cpf.csv',
      comTitulo.participante,
    )
    expect(codigos(2)).toEqual(['CONTENT_LOOKS_LIKE_CPF'])
    expect(linhas[3]!.data).toEqual({ registro: '2026-0042' })
  })

  it('homonyms.csv: dois João Pedro da Silva com CPFs diferentes são duas pessoas, com aviso', async () => {
    const { summary, codigos } = await previa(
      simples,
      'homonyms.csv',
      simples.participante,
    )
    expect(summary).toMatchObject({ create: 2, new_people: 2 })
    expect(codigos(2)).toContain('HOMONYM_IN_EVENT')
    expect(codigos(3)).toContain('HOMONYM_IN_EVENT')
  })
})
