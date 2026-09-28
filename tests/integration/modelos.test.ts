import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { LayoutField, TemplatePage } from '@/features/certificate/schema'

import { abrirSessao, type CookiesFalsos, type Papel } from './sessao'

/**
 * Actions de modelo (doc 07) com sessão de verdade: criar, salvar o rascunho,
 * publicar com as 7 regras e o snapshot, apagar. A arte chega pela action do
 * próximo passo; aqui o base.pdf é gravado direto no banco.
 */

const estado = vi.hoisted(() => ({ cookies: null as unknown }))
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(estado.cookies) }))
const updateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ updateTag }))

const { db } = await import('@/db/client')
const { certificateTemplates, certificates, events, participants, participationTypes } =
  await import('@/db/schema')
const { createEvent } = await import('@/actions/events')
const { upsertParticipationType } = await import('@/actions/participation-types')
const {
  createTemplate,
  deleteTemplate,
  getLongestNameSample,
  NOME_CANONICO,
  publishTemplate,
  saveTemplateDraft,
} = await import('@/actions/templates')

const sessoes = new Map<Papel, CookiesFalsos>()
async function entrarComo(papel: Papel) {
  const sessao = sessoes.get(papel) ?? (await abrirSessao(papel))
  sessoes.set(papel, sessao)
  estado.cookies = sessao
}

const criados: string[] = []
let eventoId: string
let eventoSlug: string

beforeAll(async () => {
  await entrarComo('editor')
  const evento = await createEvent({
    title: `Evento de modelos ${Date.now()}`,
    startsAt: '2027-03-10T19:00',
  })
  if (!evento.ok) throw new Error(evento.error.message)
  eventoId = evento.data.id
  eventoSlug = evento.data.slug
  criados.push(eventoId)
})

afterAll(async () => {
  await db().delete(certificates).where(inArray(certificates.eventId, criados))
  await db().delete(participants).where(inArray(participants.eventId, criados))
  await db().delete(events).where(inArray(events.id, criados))
})

const PAGINA: TemplatePage = { width_pt: 841.89, height_pt: 595.28, preview_path: null }

function texto(id: string, content: string): LayoutField {
  return {
    id,
    kind: 'text',
    page: 1,
    box: { x: 0.1, y: 0.4, w: 0.8, h: 0.1 },
    content,
    font: 'curated:poppins-600',
    size_pt: 24,
    min_size_pt: 12,
    color: '#1E1E1E',
    h_align: 'center',
    v_align: 'middle',
    line_height: 1.15,
    max_lines: 2,
    fit: 'shrink_then_wrap',
    transform: 'none',
  }
}

const QR: LayoutField = {
  id: 'qr',
  kind: 'qr',
  page: 1,
  box: { x: 0.85, y: 0.75, w: 0.1, h: 0.15 },
  dark: '#000000',
  light: '#FFFFFF',
}

const CAMPOS_PUBLICAVEIS = [
  texto('nome', '{{participant.full_name}}'),
  texto('codigo', 'Código {{certificate.code}}'),
  QR,
]

async function novoModelo(nome = 'Participante 2027') {
  await entrarComo('editor')
  const resultado = await createTemplate({ eventId: eventoId, name: nome })
  if (!resultado.ok) throw new Error(resultado.error.message)
  return resultado.data.id
}

/** A arte chega no próximo passo: aqui, um base.pdf fictício direto no banco. */
async function comArte(id: string) {
  await db()
    .update(certificateTemplates)
    .set({
      artKind: 'pdf',
      basePdfPath: `${id}/base.pdf`,
      basePdfSha256: 'a'.repeat(64),
      basePdfSizeBytes: 1000,
      pages: [PAGINA],
    })
    .where(eq(certificateTemplates.id, id))
}

async function linha(id: string) {
  const [modelo] = await db()
    .select()
    .from(certificateTemplates)
    .where(eq(certificateTemplates.id, id))
  return modelo!
}

describe('criar', () => {
  it('conta sem papel não cria modelo', async () => {
    await entrarComo('reader')
    const resultado = await createTemplate({ eventId: eventoId, name: 'Não pode' })
    expect(resultado).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('editor cria em rascunho, com as listas vazias', async () => {
    const id = await novoModelo()
    expect(await linha(id)).toMatchObject({
      status: 'draft',
      version: 0,
      dataFields: [],
      layoutFields: [],
      publishedSnapshot: null,
    })
  })
})

describe('rascunho', () => {
  it('placeholder desconhecido não salva, com o erro no campo', async () => {
    const id = await novoModelo()
    const resultado = await saveTemplateDraft({
      id,
      data_fields: [],
      layout_fields: [texto('nome', '{{participant.cpf}}')],
    })
    expect(resultado).toMatchObject({
      ok: false,
      error: { code: 'validation_error' },
    })
    expect(JSON.stringify(resultado)).toContain('Placeholder desconhecido')
    expect((await linha(id)).layoutFields).toEqual([])
  })

  it('salva o rascunho coerente, mesmo sem QR', async () => {
    const id = await novoModelo()
    const resultado = await saveTemplateDraft({
      id,
      data_fields: [],
      layout_fields: [texto('nome', '{{participant.full_name}}')],
    })
    expect(resultado.ok).toBe(true)
    expect((await linha(id)).layoutFields).toHaveLength(1)
  })
})

describe('publicar', () => {
  it('modelo sem arte, sem nome, sem QR e sem código lista as quatro regras', async () => {
    const id = await novoModelo()
    const resultado = await publishTemplate({ id })
    expect(resultado).toMatchObject({
      ok: false,
      error: { code: 'template_publish_blocked' },
    })
    if (resultado.ok) return
    expect(resultado.error.fieldErrors?.publicar).toHaveLength(4)
    expect((await linha(id)).status).toBe('draft')
  })

  it('publica: snapshot válido, versão 1, e derruba a página do evento', async () => {
    const id = await novoModelo()
    await comArte(id)
    await saveTemplateDraft({ id, data_fields: [], layout_fields: CAMPOS_PUBLICAVEIS })
    updateTag.mockClear()

    const resultado = await publishTemplate({ id })

    expect(resultado).toEqual({ ok: true, data: { version: 1 } })
    const modelo = await linha(id)
    expect(modelo).toMatchObject({ status: 'published', version: 1 })
    expect(modelo.publishedSnapshot).toMatchObject({
      version: 1,
      base_pdf_path: `${id}/base.pdf`,
      layout_fields: CAMPOS_PUBLICAVEIS,
    })
    expect(updateTag).toHaveBeenCalledWith(`event:${eventoSlug}`)
  })

  // DoD do M6: editar um modelo publicado não altera o PDF até publicar de novo.
  it('editar o publicado mexe só no rascunho; o snapshot muda só ao publicar de novo', async () => {
    const id = await novoModelo()
    await comArte(id)
    await saveTemplateDraft({ id, data_fields: [], layout_fields: CAMPOS_PUBLICAVEIS })
    await publishTemplate({ id })
    const publicado = (await linha(id)).publishedSnapshot

    const editado = [
      texto('nome', 'Certificamos que {{participant.full_name}}'),
      ...CAMPOS_PUBLICAVEIS.slice(1),
    ]
    await saveTemplateDraft({ id, data_fields: [], layout_fields: editado })
    expect((await linha(id)).publishedSnapshot).toEqual(publicado)

    expect(await publishTemplate({ id })).toEqual({ ok: true, data: { version: 2 } })
    expect((await linha(id)).publishedSnapshot).toMatchObject({
      version: 2,
      layout_fields: editado,
    })
  })

  it('regra 7: certificado existente sem campo obrigatório bloqueia, com a contagem', async () => {
    const id = await novoModelo()
    await comArte(id)
    const [tipo] = await db()
      .select()
      .from(participationTypes)
      .where(eq(participationTypes.eventId, eventoId))
      .limit(1)
    await upsertParticipationType({
      id: tipo!.id,
      eventId: eventoId,
      slug: tipo!.slug,
      label: tipo!.label,
      aliases: tipo!.aliases,
      defaultHours: Number(tipo!.defaultHours),
      certificateTemplateId: id,
    })
    const [pessoa] = await db()
      .insert(participants)
      .values({ eventId: eventoId, fullName: 'Pessoa Sintética de Teste' })
      .returning({ id: participants.id })
    await db().insert(certificates).values({
      eventId: eventoId,
      participantId: pessoa!.id,
      participationTypeId: tipo!.id,
    })

    await saveTemplateDraft({
      id,
      data_fields: [
        {
          key: 'titulo_palestra',
          label: 'Título da palestra',
          type: 'text',
          required: true,
          default: null,
          format: { type: 'text', max_length: 200 },
        },
      ],
      layout_fields: CAMPOS_PUBLICAVEIS,
    })
    const resultado = await publishTemplate({ id })

    expect(resultado).toMatchObject({
      ok: false,
      error: { code: 'template_publish_blocked' },
    })
    if (resultado.ok) return
    expect(resultado.error.fieldErrors?.publicar).toEqual([
      '1 certificado não tem titulo_palestra.',
    ])

    // Com o campo preenchido no certificado, a regra passa.
    await db()
      .update(certificates)
      .set({ data: { titulo_palestra: 'Git na prática' } })
      .where(eq(certificates.participantId, pessoa!.id))
    expect(await publishTemplate({ id })).toEqual({ ok: true, data: { version: 1 } })
  })
})

describe('vincular ao tipo', () => {
  it('modelo de outro evento é recusado no campo', async () => {
    await entrarComo('editor')
    const outro = await createEvent({
      title: `Outro evento ${Date.now()}`,
      startsAt: '2027-04-10T19:00',
    })
    if (!outro.ok) throw new Error(outro.error.message)
    criados.push(outro.data.id)
    const modeloDoOutro = await createTemplate({
      eventId: outro.data.id,
      name: 'Do outro',
    })
    if (!modeloDoOutro.ok) throw new Error(modeloDoOutro.error.message)

    const [tipo] = await db()
      .select()
      .from(participationTypes)
      .where(eq(participationTypes.eventId, eventoId))
      .limit(1)
    const resultado = await upsertParticipationType({
      id: tipo!.id,
      eventId: eventoId,
      slug: tipo!.slug,
      label: tipo!.label,
      aliases: tipo!.aliases,
      defaultHours: Number(tipo!.defaultHours),
      certificateTemplateId: modeloDoOutro.data.id,
    })
    expect(resultado).toMatchObject({
      ok: false,
      error: {
        fieldErrors: { certificateTemplateId: ['Esse modelo não é deste evento.'] },
      },
    })
  })
})

describe('apagar', () => {
  it('editor não apaga; admin apaga rascunho sem tipo apontando', async () => {
    const id = await novoModelo()
    expect(await deleteTemplate({ id })).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    })
    await entrarComo('admin')
    expect(await deleteTemplate({ id })).toEqual({ ok: true, data: null })
  })

  it('publicado não se apaga', async () => {
    const id = await novoModelo()
    await comArte(id)
    await saveTemplateDraft({ id, data_fields: [], layout_fields: CAMPOS_PUBLICAVEIS })
    await publishTemplate({ id })
    await entrarComo('admin')
    expect(await deleteTemplate({ id })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    })
  })
})

describe('nome mais longo', () => {
  it('evento sem participantes usa o nome canônico do doc 05', async () => {
    await entrarComo('editor')
    const vazio = await createEvent({
      title: `Sem participantes ${Date.now()}`,
      startsAt: '2027-05-10T19:00',
    })
    if (!vazio.ok) throw new Error(vazio.error.message)
    criados.push(vazio.data.id)
    const modelo = await createTemplate({ eventId: vazio.data.id, name: 'Vazio' })
    if (!modelo.ok) throw new Error(modelo.error.message)

    expect(
      await getLongestNameSample({
        templateId: modelo.data.id,
        font: 'curated:poppins-600',
        transform: 'none',
      }),
    ).toEqual({ ok: true, data: { nome: NOME_CANONICO, origem: 'canonico' } })
  })

  it('vale o mais largo na fonte do campo, e não o de mais letras', async () => {
    await entrarComo('editor')
    const evento = await createEvent({
      title: `Nomes ${Date.now()}`,
      startsAt: '2027-05-11T19:00',
    })
    if (!evento.ok) throw new Error(evento.error.message)
    criados.push(evento.data.id)
    // 19 letras largas contra 32 estreitas.
    const largo = 'Wagner Mawawe Wamba'
    const comprido = 'Ilidio Lili Iiilli Fiji Tilitili'
    await db()
      .insert(participants)
      .values(
        [largo, comprido, 'Ana Lima'].map((fullName) => ({
          eventId: evento.data.id,
          fullName,
        })),
      )
    const modelo = await createTemplate({ eventId: evento.data.id, name: 'Nomes' })
    if (!modelo.ok) throw new Error(modelo.error.message)

    const resultado = await getLongestNameSample({
      templateId: modelo.data.id,
      font: 'curated:poppins-600',
      transform: 'none',
    })
    expect(resultado).toEqual({ ok: true, data: { nome: largo, origem: 'evento' } })
  })
})
