import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { abrirSessao, type CookiesFalsos, type Papel } from './sessao'

/**
 * Participantes fora da importação (doc 07), pelas actions com sessão real:
 * criar à mão com a validação da importação, editar, revogar, e a remoção do
 * ADR-0007 (CSV-I8).
 */

const estado = vi.hoisted(() => ({ cookies: null as unknown }))
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(estado.cookies) }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

const { db } = await import('@/db/client')
const {
  auditLogs,
  certificates,
  events,
  nameCorrectionRequests,
  participants,
  participationTypes,
} = await import('@/db/schema')
const { createEvent } = await import('@/actions/events')
const { createTemplate } = await import('@/actions/templates')
const {
  createCertificateManually,
  removeCertificates,
  restoreCertificate,
  revokeCertificate,
  updateCertificate,
  updateParticipant,
} = await import('@/actions/certificates')

const sessoes = new Map<Papel, CookiesFalsos>()
async function entrarComo(papel: Papel) {
  const sessao = sessoes.get(papel) ?? (await abrirSessao(papel))
  sessoes.set(papel, sessao)
  estado.cookies = sessao
}

const criados: string[] = []

beforeAll(async () => {
  await entrarComo('editor')
})

afterAll(async () => {
  await db().delete(certificates).where(inArray(certificates.eventId, criados))
  await db().delete(participants).where(inArray(participants.eventId, criados))
  await db().delete(events).where(inArray(events.id, criados))
})

/** Evento com participante e palestrante ligados ao mesmo modelo vazio. */
async function novoEvento() {
  const evento = await createEvent({
    title: `Participantes ${Date.now()}`,
    startsAt: '2027-03-10T19:00',
  })
  if (!evento.ok) throw new Error(evento.error.message)
  criados.push(evento.data.id)
  const modelo = await createTemplate({ eventId: evento.data.id, name: 'Todos' })
  if (!modelo.ok) throw new Error(modelo.error.message)
  const tipos = await db()
    .update(participationTypes)
    .set({ certificateTemplateId: modelo.data.id })
    .where(
      and(
        eq(participationTypes.eventId, evento.data.id),
        inArray(participationTypes.slug, ['participante', 'palestrante']),
      ),
    )
    .returning({ id: participationTypes.id, slug: participationTypes.slug })
  const porSlug = Object.fromEntries(tipos.map((tipo) => [tipo.slug, tipo.id]))
  return {
    eventoId: evento.data.id,
    participante: porSlug.participante!,
    palestrante: porSlug.palestrante!,
  }
}

async function criar(
  evento: { eventoId: string; participante: string },
  nome: string,
  cpf?: string,
) {
  const resultado = await createCertificateManually({
    eventId: evento.eventoId,
    participationTypeId: evento.participante,
    participant: { fullName: nome, cpf },
  })
  if (!resultado.ok)
    throw new Error(`${resultado.error.code}: ${resultado.error.message}`)
  return resultado.data
}

describe('criar à mão', () => {
  it('com a mesma validação da importação, e o CPF só em HMAC', async () => {
    const evento = await novoEvento()
    const { participantId } = await criar(evento, '  Ana   Lima ', '529.982.247-25')
    const [pessoa] = await db()
      .select()
      .from(participants)
      .where(eq(participants.id, participantId))
    expect(pessoa).toMatchObject({ fullName: 'Ana Lima', cpfLast3: '725' })
    expect(pessoa?.cpfHash).toMatch(/^[0-9a-f]{64}$/)

    const repetido = await createCertificateManually({
      eventId: evento.eventoId,
      participationTypeId: evento.participante,
      participant: { fullName: 'Outra Pessoa', cpf: '52998224725' },
    })
    expect(repetido).toMatchObject({
      ok: false,
      error: { code: 'conflict', fieldErrors: { cpf: expect.any(Array) } },
    })

    const invalido = await createCertificateManually({
      eventId: evento.eventoId,
      participationTypeId: evento.participante,
      participant: { fullName: 'Pessoa Invalida', cpf: '529.982.247-24' },
    })
    expect(invalido).toMatchObject({
      ok: false,
      error: { code: 'validation_error', fieldErrors: { cpf: expect.any(Array) } },
    })

    const particulas = await createCertificateManually({
      eventId: evento.eventoId,
      participationTypeId: evento.participante,
      participant: { fullName: 'De Da' },
    })
    expect(particulas).toMatchObject({
      ok: false,
      error: { fieldErrors: { fullName: expect.any(Array) } },
    })
  })

  it('pessoa existente ganha o certificado de outro tipo, mas não um segundo do mesmo', async () => {
    const evento = await novoEvento()
    const { participantId } = await criar(evento, 'Bruno Costa')
    const palestra = await createCertificateManually({
      eventId: evento.eventoId,
      participationTypeId: evento.palestrante,
      participantId,
    })
    expect(palestra.ok).toBe(true)
    const repetido = await createCertificateManually({
      eventId: evento.eventoId,
      participationTypeId: evento.participante,
      participantId,
    })
    expect(repetido).toMatchObject({ ok: false, error: { code: 'conflict' } })
  })
})

describe('editar', () => {
  it('nome novo sobe a versão, aprova o pedido de correção pendente e a auditoria não guarda o valor', async () => {
    const evento = await novoEvento()
    const { participantId, certificateId } = await criar(evento, 'Carla Mendez')
    await db().insert(nameCorrectionRequests).values({
      certificateId,
      currentName: 'Carla Mendez',
      requestedName: 'Carla Méndez',
      contact: 'carla@exemplo.org',
    })

    const resultado = await updateParticipant({
      id: participantId,
      fullName: 'Carla Méndez',
      email: 'carla@exemplo.org',
    })
    expect(resultado).toEqual({ ok: true, data: undefined })

    const [certificado] = await db()
      .select()
      .from(certificates)
      .where(eq(certificates.id, certificateId))
    expect(certificado?.version).toBe(2)
    const [pedido] = await db()
      .select({ status: nameCorrectionRequests.status })
      .from(nameCorrectionRequests)
      .where(eq(nameCorrectionRequests.certificateId, certificateId))
    expect(pedido?.status).toBe('approved')

    const [registro] = await db()
      .select({ diff: auditLogs.diff })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'participant.update'),
          eq(auditLogs.entityId, participantId),
        ),
      )
    expect(registro?.diff).toEqual({ fields: ['fullName', 'email'] })

    const apagado = await updateParticipant({ id: participantId, email: null })
    expect(apagado.ok).toBe(true)
    const [pessoa] = await db()
      .select()
      .from(participants)
      .where(eq(participants.id, participantId))
    expect(pessoa?.email).toBeNull()
  })

  it('carga horária: vírgula aceita, e texto recusado', async () => {
    const evento = await novoEvento()
    const { certificateId } = await criar(evento, 'Diego Faria')
    expect((await updateCertificate({ id: certificateId, hours: '4,5' })).ok).toBe(true)
    const [certificado] = await db()
      .select()
      .from(certificates)
      .where(eq(certificates.id, certificateId))
    expect(certificado).toMatchObject({ hours: '4.5', version: 2 })
    expect(await updateCertificate({ id: certificateId, hours: 'quatro' })).toMatchObject(
      {
        ok: false,
        error: { fieldErrors: { hours: expect.any(Array) } },
      },
    )
  })
})

describe('revogar e remover', () => {
  it('revogar pede motivo; restaurar volta a valer', async () => {
    const evento = await novoEvento()
    const { certificateId } = await criar(evento, 'Elisa Prado')
    expect(await revokeCertificate({ id: certificateId, reason: 'curto' })).toMatchObject(
      {
        ok: false,
        error: { code: 'validation_error' },
      },
    )
    expect(
      (await revokeCertificate({ id: certificateId, reason: 'Inscrição em duplicidade' }))
        .ok,
    ).toBe(true)
    expect((await restoreCertificate({ id: certificateId })).ok).toBe(true)
    const [certificado] = await db()
      .select()
      .from(certificates)
      .where(eq(certificates.id, certificateId))
    expect(certificado).toMatchObject({
      status: 'active',
      revokedAt: null,
      revokedReason: null,
    })
  })

  it('CSV-I8: apaga os nunca baixados; com um baixado na seleção, recusa tudo e diz qual', async () => {
    const evento = await novoEvento()
    const a = await criar(evento, 'Fabio Lima')
    const b = await criar(evento, 'Gabi Souza')
    const c = await criar(evento, 'Heitor Reis')
    await db()
      .update(certificates)
      .set({ firstDownloadedAt: new Date() })
      .where(eq(certificates.id, c.certificateId))
    const ids = [a.certificateId, b.certificateId, c.certificateId]

    expect(
      await removeCertificates({
        eventId: evento.eventoId,
        certificateIds: ids,
        confirmCount: 2,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'validation_error' },
    })
    expect(
      await removeCertificates({
        eventId: evento.eventoId,
        certificateIds: ids,
        confirmCount: 3,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'must_revoke', fieldErrors: { certificateIds: [c.certificateId] } },
    })
    expect(
      await db().select().from(certificates).where(inArray(certificates.id, ids)),
    ).toHaveLength(3)

    const removido = await removeCertificates({
      eventId: evento.eventoId,
      certificateIds: [a.certificateId, b.certificateId],
      confirmCount: 2,
    })
    expect(removido).toEqual({ ok: true, data: { removed: 2, participantsRemoved: 2 } })
    expect(
      await db()
        .select()
        .from(participants)
        .where(inArray(participants.id, [a.participantId, b.participantId])),
    ).toEqual([])
  })

  it('depois da liberação: editor não remove, e admin recebe must_revoke', async () => {
    const evento = await novoEvento()
    const { certificateId } = await criar(evento, 'Iara Campos')
    await db()
      .update(events)
      .set({ certificatesReleasedAt: new Date() })
      .where(eq(events.id, evento.eventoId))
    const pedido = {
      eventId: evento.eventoId,
      certificateIds: [certificateId],
      confirmCount: 1,
    }

    expect(await removeCertificates(pedido)).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    })
    await entrarComo('admin')
    try {
      expect(await removeCertificates(pedido)).toMatchObject({
        ok: false,
        error: { code: 'must_revoke' },
      })
    } finally {
      await entrarComo('editor')
    }
  })

  it('leitor não remove', async () => {
    const evento = await novoEvento()
    const { certificateId } = await criar(evento, 'Joana Dias')
    await entrarComo('reader')
    try {
      expect(
        await removeCertificates({
          eventId: evento.eventoId,
          certificateIds: [certificateId],
          confirmCount: 1,
        }),
      ).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    } finally {
      await entrarComo('editor')
    }
  })
})
