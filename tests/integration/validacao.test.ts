import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * `validateCertificate` contra o banco local (docs 03, 6e, e 07): os estados,
 * o que cada um mostra e o registro em validation_checks.
 */

const { db } = await import('@/db/client')
const { certificates, events, participants, participationTypes, validationChecks } =
  await import('@/db/schema')
const { validateCertificate } = await import('@/db/queries/public-lookup')

let eventoId: string
const codigos: Record<string, string> = {}
const IP = `validacao-${randomUUID()}`

beforeAll(async () => {
  const [evento] = await db()
    .insert(events)
    .values({
      slug: `validacao-${randomUUID().slice(0, 8)}`,
      title: 'Evento da validação',
      startsAt: new Date('2026-09-12T11:00:00Z'),
      status: 'certificates_available',
      searchByName: true,
    })
    .returning({ id: events.id })
  eventoId = evento!.id
  const [tipo] = await db()
    .insert(participationTypes)
    .values({
      eventId: eventoId,
      slug: 'participante',
      label: 'Participante',
      defaultHours: '8',
    })
    .returning({ id: participationTypes.id })
  const pessoas = await db()
    .insert(participants)
    .values(
      ['Valida Pessoa', 'Revogada Pessoa', 'Nao Emitida Pessoa', 'Corrigida Pessoa'].map(
        (fullName) => ({ eventId: eventoId, fullName }),
      ),
    )
    .returning({ id: participants.id, nome: participants.fullName })
  const id = (nome: string) => pessoas.find((p) => p.nome === nome)!.id
  const emitido = new Date('2026-09-20T15:00:00Z')
  const criados = await db()
    .insert(certificates)
    .values([
      {
        eventId: eventoId,
        participantId: id('Valida Pessoa'),
        participationTypeId: tipo!.id,
        hours: '8',
        issuedAt: emitido,
      },
      {
        eventId: eventoId,
        participantId: id('Revogada Pessoa'),
        participationTypeId: tipo!.id,
        hours: '8',
        issuedAt: emitido,
        status: 'revoked',
        revokedAt: new Date('2026-09-25T15:00:00Z'),
        revokedReason: 'Motivo que a página nunca mostra',
      },
      {
        eventId: eventoId,
        participantId: id('Nao Emitida Pessoa'),
        participationTypeId: tipo!.id,
        hours: '8',
      },
      {
        eventId: eventoId,
        participantId: id('Corrigida Pessoa'),
        participationTypeId: tipo!.id,
        hours: '8',
        issuedAt: emitido,
      },
    ])
    .returning({ code: certificates.code, participantId: certificates.participantId })
  for (const nome of [
    'Valida Pessoa',
    'Revogada Pessoa',
    'Nao Emitida Pessoa',
    'Corrigida Pessoa',
  ]) {
    codigos[nome] = criados.find((c) => c.participantId === id(nome))!.code
  }
  // A correção de nome sobe a versão e marca a data do conteúdo.
  await db()
    .update(participants)
    .set({ fullName: 'Corrigida Pessoa Nova' })
    .where(eq(participants.id, id('Corrigida Pessoa')))
  // A lápide da eliminação: sem pessoa, sem dado.
  const [apagado] = await db()
    .insert(participants)
    .values({ eventId: eventoId, fullName: 'Apagada Pessoa' })
    .returning({ id: participants.id })
  const [lapide] = await db()
    .insert(certificates)
    .values({
      eventId: eventoId,
      participantId: apagado!.id,
      participationTypeId: tipo!.id,
      hours: '8',
      issuedAt: emitido,
    })
    .returning({ code: certificates.code })
  await db()
    .update(certificates)
    .set({ status: 'erased', participantId: null, data: {} })
    .where(eq(certificates.code, lapide!.code))
  codigos['Apagada Pessoa'] = lapide!.code
})

afterAll(async () => {
  await db().delete(certificates).where(eq(certificates.eventId, eventoId))
  await db().delete(participants).where(eq(participants.eventId, eventoId))
  await db().delete(events).where(eq(events.id, eventoId))
})

describe('validateCertificate', () => {
  it('válido: nome, evento, tipo, horas, emissão; sem "dados atualizados" na versão 1', async () => {
    expect(await validateCertificate(codigos['Valida Pessoa']!, IP)).toMatchObject({
      outcome: 'valid',
      fullName: 'Valida Pessoa',
      eventTitle: 'Evento da validação',
      typeLabel: 'Participante',
      hours: 8,
      issuedAt: new Date('2026-09-20T15:00:00Z'),
      contentUpdatedAt: null,
    })
  })

  it('corrigido depois da emissão: "dados atualizados em" e o nome novo', async () => {
    const resultado = await validateCertificate(codigos['Corrigida Pessoa']!, IP)
    expect(resultado).toMatchObject({
      outcome: 'valid',
      fullName: 'Corrigida Pessoa Nova',
    })
    expect(resultado.outcome === 'valid' && resultado.contentUpdatedAt).toBeInstanceOf(
      Date,
    )
  })

  it('revogado: a data, e nunca o motivo', async () => {
    const resultado = await validateCertificate(codigos['Revogada Pessoa']!, IP)
    expect(resultado).toMatchObject({
      outcome: 'revoked',
      revokedAt: new Date('2026-09-25T15:00:00Z'),
    })
    expect(JSON.stringify(resultado)).not.toContain('Motivo')
  })

  it('apagado a pedido: nenhum dado, nem o nome', async () => {
    expect(await validateCertificate(codigos['Apagada Pessoa']!, IP)).toEqual({
      outcome: 'erased',
    })
  })

  it('não emitido e inexistente respondem igual: o código não é público antes da liberação', async () => {
    expect(await validateCertificate(codigos['Nao Emitida Pessoa']!, IP)).toEqual({
      outcome: 'not_found',
    })
    expect(await validateCertificate('ZZZZZZZZZZ', IP)).toEqual({ outcome: 'not_found' })
  })

  it('toda consulta vira validation_checks, com o desfecho e sem dado de pessoa', async () => {
    const registros = await db()
      .select({ outcome: validationChecks.outcome })
      .from(validationChecks)
      .where(eq(validationChecks.ipHash, IP))
    expect(registros.map((r) => r.outcome).sort()).toEqual([
      'erased',
      'not_found',
      'not_found',
      'revoked',
      'valid',
      'valid',
    ])
  })
})
