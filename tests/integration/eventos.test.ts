import { and, desc, eq, inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { abrirSessao, type CookiesFalsos, type Papel } from './sessao'

/**
 * Actions de evento e de tipo de participação (doc 07), com sessão de verdade
 * em cada papel. O gate real da escrita é o `defineAction`: a conexão do app
 * não carrega JWT, então é esta suíte que prova que ele está no lugar.
 */

const estado = vi.hoisted(() => ({ cookies: null as unknown }))

// O cliente do Supabase lê a sessão de `cookies()`; injetamos os cookies de um
// login de senha real no GoTrue local.
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve(estado.cookies),
}))

// Fora de uma requisição do Next não há cache para derrubar.
const updateTag = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ updateTag }))

const { db } = await import('@/db/client')
const {
  auditLogs,
  certificates,
  certificateTemplates,
  events,
  participants,
  participationTypes,
} = await import('@/db/schema')
const {
  createCoverUploadUrl,
  createEvent,
  deleteEvent,
  releaseCertificates,
  setEventStatus,
  updateEvent,
} = await import('@/actions/events')
const { deleteParticipationType, upsertParticipationType } =
  await import('@/actions/participation-types')

const sessoes = new Map<Papel, CookiesFalsos>()

async function entrarComo(papel: Papel | null) {
  if (papel === null) {
    estado.cookies = { getAll: () => [], get: () => undefined, set: () => {} }
    return
  }
  const sessao = sessoes.get(papel) ?? (await abrirSessao(papel))
  sessoes.set(papel, sessao)
  estado.cookies = sessao
}

const criados: string[] = []
let contador = 0

async function novoEvento(extra: Record<string, unknown> = {}) {
  contador += 1
  await entrarComo('editor')
  const resultado = await createEvent({
    title: `Evento de integração ${Date.now()} ${contador}`,
    startsAt: '2027-03-10T19:00',
    ...extra,
  })
  if (!resultado.ok) throw new Error(`createEvent falhou: ${resultado.error.message}`)
  criados.push(resultado.data.id)
  return resultado.data
}

afterAll(async () => {
  if (criados.length === 0) return
  await db().delete(certificates).where(inArray(certificates.eventId, criados))
  await db().delete(participants).where(inArray(participants.eventId, criados))
  await db().delete(events).where(inArray(events.id, criados))
})

describe('quem pode o quê', () => {
  it('sem sessão, nada', async () => {
    await entrarComo(null)
    const resultado = await createEvent({
      title: 'Sem sessão',
      startsAt: '2027-03-10T19:00',
    })

    expect(resultado).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
  })

  it('conta sem papel não cria evento', async () => {
    await entrarComo('reader')
    const resultado = await createEvent({
      title: 'Do reader',
      startsAt: '2027-03-10T19:00',
    })

    expect(resultado).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('editor cria; apagar evento é só do admin', async () => {
    const { id } = await novoEvento()

    await entrarComo('editor')
    expect(await deleteEvent({ id })).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    })

    await entrarComo('admin')
    expect(await deleteEvent({ id })).toMatchObject({ ok: true })
    expect(await db().select().from(events).where(eq(events.id, id))).toHaveLength(0)
  })
})

describe('createEvent', () => {
  it('nasce em rascunho, com o slug do título e os quatro tipos padrão', async () => {
    const { id, slug } = await novoEvento({
      title: 'Oficina de Acessibilidade — Turma 2',
    })

    expect(slug).toBe('oficina-de-acessibilidade-turma-2')

    const [evento] = await db().select().from(events).where(eq(events.id, id))
    expect(evento?.status).toBe('draft')
    expect(evento?.cpfSalt).toMatch(/^[0-9a-f]{32}$/)

    const tipos = await db()
      .select({ slug: participationTypes.slug, horas: participationTypes.defaultHours })
      .from(participationTypes)
      .where(eq(participationTypes.eventId, id))
      .orderBy(participationTypes.sortOrder)
    expect(tipos).toEqual([
      { slug: 'participante', horas: '0.0' },
      { slug: 'palestrante', horas: '0.0' },
      { slug: 'organizador', horas: '0.0' },
      { slug: 'monitor', horas: '0.0' },
    ])
  })

  it('grava a auditoria na mesma transação, com o autor', async () => {
    const { id } = await novoEvento()

    const [registro] = await db()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, 'event.create')))
    expect(registro?.actorId).toBe('ad000000-0000-4000-8000-000000000002')
    expect(registro?.diff).toMatchObject({ tiposPadrao: 4 })
  })

  it('endereço repetido é recusado no campo, sem criar nada', async () => {
    const { slug } = await novoEvento()

    await entrarComo('editor')
    const resultado = await createEvent({
      title: 'Outro',
      slug,
      startsAt: '2027-03-10T19:00',
    })

    expect(resultado).toMatchObject({
      ok: false,
      error: { code: 'conflict', fieldErrors: { slug: [expect.any(String)] } },
    })
  })

  it('derruba o cache do catálogo', async () => {
    updateTag.mockClear()
    await novoEvento()

    expect(updateTag).toHaveBeenCalledWith('events')
  })
})

describe('updateEvent', () => {
  it('muda só o que veio, e campo apagado apaga', async () => {
    const { id } = await novoEvento({
      externalUrl: 'https://inscricoes.example.com/a',
      descriptionMd: 'Descrição que tem de sobreviver.',
    })

    await entrarComo('editor')
    expect(await updateEvent({ id, city: 'Jales', externalUrl: '' })).toMatchObject({
      ok: true,
    })

    const [evento] = await db().select().from(events).where(eq(events.id, id))
    expect(evento).toMatchObject({
      city: 'Jales',
      externalUrl: null,
      descriptionMd: 'Descrição que tem de sobreviver.',
    })
  })

  it('confere o término contra o início que está no banco', async () => {
    const { id } = await novoEvento()

    await entrarComo('editor')
    const resultado = await updateEvent({ id, endsAt: '2027-03-10T18:00' })

    expect(resultado).toMatchObject({
      ok: false,
      error: { code: 'validation_error', fieldErrors: { endsAt: [expect.any(String)] } },
    })
  })

  it('a data de nascimento sozinha não vira chave de busca (ADR-0009)', async () => {
    const { id } = await novoEvento()

    await entrarComo('editor')
    const resultado = await updateEvent({ id, searchBirthDate: true })

    expect(resultado).toMatchObject({
      ok: false,
      error: { fieldErrors: { searchBirthDate: [expect.any(String)] } },
    })
  })

  it('o endereço trava quando o evento sai do rascunho', async () => {
    const { id, slug } = await novoEvento()

    await entrarComo('editor')
    expect(await updateEvent({ id, slug: `${slug}-novo` })).toMatchObject({ ok: true })
    expect(await setEventStatus({ id, status: 'registration_open' })).toMatchObject({
      ok: true,
    })

    const resultado = await updateEvent({ id, slug: `${slug}-outro` })
    expect(resultado).toMatchObject({ ok: false, error: { code: 'slug_locked' } })
  })

  it('derruba a página do evento pela tag dela', async () => {
    const { id, slug } = await novoEvento()

    await entrarComo('editor')
    updateTag.mockClear()
    await updateEvent({ id, city: 'Votuporanga' })

    expect(updateTag).toHaveBeenCalledWith('events')
    expect(updateTag).toHaveBeenCalledWith(`event:${slug}`)
  })
})

describe('setEventStatus', () => {
  it('muda o status e registra de onde para onde', async () => {
    const { id } = await novoEvento()

    await entrarComo('editor')
    expect(await setEventStatus({ id, status: 'registration_open' })).toMatchObject({
      ok: true,
    })

    const [registro] = await db()
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, id), eq(auditLogs.action, 'event.set_status')))
      .orderBy(desc(auditLogs.id))
    expect(registro?.diff).toEqual({ status: ['draft', 'registration_open'] })
  })

  it('não põe certificados no ar pelo seletor, nem volta ao rascunho', async () => {
    const { id } = await novoEvento()

    await entrarComo('editor')
    expect(await setEventStatus({ id, status: 'certificates_available' })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    })

    await setEventStatus({ id, status: 'completed' })
    expect(await setEventStatus({ id, status: 'draft' })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    })
  })
})

describe('releaseCertificates (E21)', () => {
  async function tipoDoEvento(eventoId: string, slug: string) {
    const [tipo] = await db()
      .select({ id: participationTypes.id })
      .from(participationTypes)
      .where(
        and(eq(participationTypes.eventId, eventoId), eq(participationTypes.slug, slug)),
      )
    return tipo!.id
  }

  async function certificado(
    eventoId: string,
    tipoId: string,
    status: 'active' | 'revoked' = 'active',
  ) {
    const [pessoa] = await db()
      .insert(participants)
      .values({ eventId: eventoId, fullName: `Pessoa ${status} ${Date.now()}` })
      .returning({ id: participants.id })
    const [criado] = await db()
      .insert(certificates)
      .values({
        eventId: eventoId,
        participantId: pessoa!.id,
        participationTypeId: tipoId,
        hours: '2',
        status,
        ...(status === 'revoked'
          ? { revokedAt: new Date(), revokedReason: 'Teste de liberação' }
          : {}),
      })
      .returning({ id: certificates.id })
    return criado!.id
  }

  async function publicarModeloDo(eventoId: string, tipoId: string) {
    const [modelo] = await db()
      .insert(certificateTemplates)
      .values({
        eventId: eventoId,
        name: 'Modelo publicado',
        status: 'published',
        version: 1,
        publishedSnapshot: { version: 1 },
        publishedAt: new Date(),
      })
      .returning({ id: certificateTemplates.id })
    await db()
      .update(participationTypes)
      .set({ certificateTemplateId: modelo!.id })
      .where(eq(participationTypes.id, tipoId))
  }

  it('leitor não libera', async () => {
    const { id } = await novoEvento()
    await entrarComo('reader')
    expect(await releaseCertificates({ id })).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    })
  })

  it('falha com a lista do que falta, e nada muda', async () => {
    const { id } = await novoEvento()
    await entrarComo('editor')
    const vazio = await releaseCertificates({ id })
    expect(vazio).toMatchObject({
      ok: false,
      error: { code: 'release_preconditions_failed' },
    })
    expect(!vazio.ok && vazio.error.fieldErrors?.liberar).toEqual([
      'Nenhum certificado ativo: importe os participantes antes de liberar.',
      'Com os certificados no ar, a busca precisa de ao menos uma chave: CPF, e-mail ou nome.',
    ])

    // Revogado não conta como ativo, nem pede modelo.
    await certificado(id, await tipoDoEvento(id, 'monitor'), 'revoked')
    const soRevogado = await releaseCertificates({ id })
    expect(!soRevogado.ok && soRevogado.error.fieldErrors?.liberar).toEqual(
      !vazio.ok && vazio.error.fieldErrors?.liberar,
    )

    await certificado(id, await tipoDoEvento(id, 'palestrante'))
    await db().update(events).set({ searchByCpf: true }).where(eq(events.id, id))
    const semModelo = await releaseCertificates({ id })
    expect(!semModelo.ok && semModelo.error.fieldErrors?.liberar).toEqual([
      'O tipo Palestrante tem certificados, mas o modelo dele não está publicado.',
    ])

    // Modelo em rascunho é o mesmo que nenhum: o PDF sai da versão publicada.
    const [rascunho] = await db()
      .insert(certificateTemplates)
      .values({ eventId: id, name: 'Ainda em rascunho' })
      .returning({ id: certificateTemplates.id })
    await db()
      .update(participationTypes)
      .set({ certificateTemplateId: rascunho!.id })
      .where(eq(participationTypes.id, await tipoDoEvento(id, 'palestrante')))
    const comRascunho = await releaseCertificates({ id })
    expect(!comRascunho.ok && comRascunho.error.fieldErrors?.liberar).toEqual(
      !semModelo.ok && semModelo.error.fieldErrors?.liberar,
    )

    const [evento] = await db().select().from(events).where(eq(events.id, id))
    expect(evento).toMatchObject({ status: 'draft', certificatesReleasedAt: null })
  })

  it('com tudo certo, muda o status, emite os certificados e audita', async () => {
    const { id, slug } = await novoEvento()
    const palestrante = await tipoDoEvento(id, 'palestrante')
    const ativo = await certificado(id, palestrante)
    const revogado = await certificado(id, await tipoDoEvento(id, 'monitor'), 'revoked')
    // Emitido numa liberação anterior: a data fica.
    const antes = new Date('2026-09-14T15:00:00Z')
    const jaEmitido = await certificado(id, palestrante)
    await db()
      .update(certificates)
      .set({ issuedAt: antes })
      .where(eq(certificates.id, jaEmitido))
    await publicarModeloDo(id, palestrante)
    await db().update(events).set({ searchByEmail: true }).where(eq(events.id, id))

    await entrarComo('editor')
    updateTag.mockClear()
    const resultado = await releaseCertificates({ id })
    expect(resultado).toEqual({ ok: true, data: { emitidos: 2 } })

    const [evento] = await db().select().from(events).where(eq(events.id, id))
    expect(evento!.status).toBe('certificates_available')
    expect(evento!.certificatesReleasedAt).toBeInstanceOf(Date)
    const emitidos = await db()
      .select({ id: certificates.id, issuedAt: certificates.issuedAt })
      .from(certificates)
      .where(inArray(certificates.id, [ativo, revogado]))
    expect(emitidos.every((linha) => linha.issuedAt instanceof Date)).toBe(true)
    const [mantido] = await db()
      .select({ issuedAt: certificates.issuedAt })
      .from(certificates)
      .where(eq(certificates.id, jaEmitido))
    expect(mantido!.issuedAt).toEqual(antes)
    expect(updateTag).toHaveBeenCalledWith('events')
    expect(updateTag).toHaveBeenCalledWith(`event:${slug}`)

    const [auditoria] = await db()
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, 'event.release_certificates'),
        ),
      )
    expect(auditoria!.diff).toEqual({
      status: ['draft', 'certificates_available'],
      emitidos: 2,
    })

    // Liberar de novo mudaria a data da liberação.
    expect(await releaseCertificates({ id })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    })
  })
})

describe('deleteEvent', () => {
  it('evento fora do rascunho não se apaga: arquiva-se', async () => {
    const { id } = await novoEvento()
    await entrarComo('editor')
    await setEventStatus({ id, status: 'registration_open' })

    await entrarComo('admin')
    expect(await deleteEvent({ id })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    })
  })

  it('evento com certificado não se apaga, nem em rascunho', async () => {
    const { id } = await novoEvento()
    const [tipo] = await db()
      .select({ id: participationTypes.id })
      .from(participationTypes)
      .where(eq(participationTypes.eventId, id))
    const [pessoa] = await db()
      .insert(participants)
      .values({ eventId: id, fullName: 'Pessoa Sintética de Teste' })
      .returning({ id: participants.id })
    await db()
      .insert(certificates)
      .values({ eventId: id, participantId: pessoa!.id, participationTypeId: tipo!.id })

    await entrarComo('admin')
    const resultado = await deleteEvent({ id })

    expect(resultado).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(await db().select().from(events).where(eq(events.id, id))).toHaveLength(1)
  })
})

describe('capa por URL assinada', () => {
  // Assinatura de PNG e alguns bytes: é o que o servidor confere.
  const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13,
  ])

  async function subir(eventId: string, bytes: Uint8Array<ArrayBuffer>) {
    await entrarComo('editor')
    const url = await createCoverUploadUrl({
      eventId,
      contentType: 'image/png',
      size: bytes.byteLength,
    })
    if (!url.ok) throw new Error(url.error.message)

    const envio = await fetch(url.data.urlAssinada, {
      method: 'PUT',
      body: bytes,
      headers: { 'content-type': 'image/png' },
    })
    expect(envio.ok).toBe(true)
    return url.data.caminho
  }

  it('o caminho fica na pasta do evento, e a capa de verdade é aceita', async () => {
    const { id } = await novoEvento()
    const caminho = await subir(id, PNG)

    expect(caminho).toMatch(new RegExp(`^${id}/[0-9a-f-]{36}\\.png$`))
    expect(await updateEvent({ id, coverPath: caminho })).toMatchObject({ ok: true })
  })

  it('arquivo que só tem a extensão de imagem é recusado e apagado', async () => {
    const { id } = await novoEvento()
    const caminho = await subir(id, new TextEncoder().encode('<svg xmlns="x"></svg>'))

    expect(await updateEvent({ id, coverPath: caminho })).toMatchObject({
      ok: false,
      error: { fieldErrors: { coverPath: [expect.any(String)] } },
    })

    const [evento] = await db().select().from(events).where(eq(events.id, id))
    expect(evento?.coverPath).toBeNull()
  })

  it('recusa arquivo acima do teto do bucket', async () => {
    const { id } = await novoEvento()

    await entrarComo('editor')
    const resultado = await createCoverUploadUrl({
      eventId: id,
      contentType: 'image/png',
      size: 6 * 1024 * 1024,
    })
    expect(resultado).toMatchObject({ ok: false, error: { code: 'validation_error' } })
  })
})

describe('tipos de participação', () => {
  it('cria no fim da lista, edita, e recusa identificador repetido', async () => {
    const { id: eventId } = await novoEvento()

    await entrarComo('editor')
    const criado = await upsertParticipationType({
      eventId,
      slug: 'mediador',
      label: 'Mediador',
      aliases: 'mediação, moderador',
      defaultHours: '1.5',
    })
    expect(criado).toMatchObject({ ok: true })
    if (!criado.ok) return

    const [tipo] = await db()
      .select()
      .from(participationTypes)
      .where(eq(participationTypes.id, criado.data.id))
    expect(tipo).toMatchObject({
      sortOrder: 5,
      defaultHours: '1.5',
      aliases: ['mediação', 'moderador'],
    })

    expect(
      await upsertParticipationType({
        id: criado.data.id,
        eventId,
        slug: 'mediador',
        label: 'Mediação',
        aliases: '',
        defaultHours: '2',
      }),
    ).toMatchObject({ ok: true })

    expect(
      await upsertParticipationType({
        eventId,
        slug: 'mediador',
        label: 'Outro',
        aliases: '',
        defaultHours: '1',
      }),
    ).toMatchObject({ ok: false, error: { code: 'conflict' } })
  })

  it('tipo sem certificado se apaga; tipo com certificado, não', async () => {
    await entrarComo('editor')

    // Seed de desenvolvimento: no Ferpa Tech Day, o participante tem 40.
    const participante = 'de000000-0000-4000-8000-00000000b001'

    const recusado = await deleteParticipationType({ id: participante })
    expect(recusado).toMatchObject({ ok: false, error: { code: 'conflict' } })
    if (!recusado.ok) expect(recusado.error.message).toMatch(/40 certificados/)

    const { id: eventId } = await novoEvento()
    const [semCertificado] = await db()
      .select({ id: participationTypes.id })
      .from(participationTypes)
      .where(
        and(
          eq(participationTypes.eventId, eventId),
          eq(participationTypes.slug, 'monitor'),
        ),
      )

    await entrarComo('editor')
    expect(await deleteParticipationType({ id: semCertificado!.id })).toMatchObject({
      ok: true,
    })
  })
})
