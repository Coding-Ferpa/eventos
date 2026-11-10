'use server'

import { and, eq, inArray, sql } from 'drizzle-orm'

import type { Transaction } from '@/db/client'
import { loadImportContext } from '@/db/queries/imports'
import {
  certificateTemplates,
  certificates,
  events,
  nameCorrectionRequests,
  participants,
  participationTypes,
} from '@/db/schema'
import { buildDataSchema, parseHours } from '@/features/certificate/data-schema'
import { dataFieldSchema } from '@/features/certificate/schema'
import {
  validateIdentity,
  validateRow,
  type RowIssue,
} from '@/features/import/validate-row'
import { serverEnv } from '@/lib/env'
import { hmacCpf } from '@/lib/hmac'
import { hasRole } from '@/lib/roles'
import { z } from '@/lib/zod'

import { defineAction, FalhaDaAction } from './define-action'

/**
 * Participantes e certificados fora da importação (doc 07): editar uma
 * pessoa, criar uma à mão com a mesma validação da importação, revogar e
 * remover. O `diff` da auditoria cita os campos que mudaram, nunca os
 * valores: é dado pessoal.
 */

const CAMPO_DO_PROBLEMA: Record<string, string> = {
  full_name: 'fullName',
  cpf: 'cpf',
  birth_date: 'birthDate',
  email: 'email',
}

function recusarProblemas(problemas: RowIssue[]) {
  const erros = problemas.filter((problema) => problema.severity === 'error')
  if (erros.length === 0) return
  const fieldErrors: Record<string, string[]> = {}
  for (const erro of erros) {
    const campo = erro.field
      ? (CAMPO_DO_PROBLEMA[erro.field] ?? `data.${erro.field}`)
      : 'form'
    ;(fieldErrors[campo] ??= []).push(erro.detail)
  }
  throw new FalhaDaAction(
    'validation_error',
    'Confira os campos destacados.',
    fieldErrors,
  )
}

/** O banco normaliza o nome; partícula sozinha não passa no check (doc 04). */
async function exigirNomeUtil(tx: Transaction, nome: string) {
  const [linha] = await tx.execute<{ normalizado: string }>(
    sql`select eventos.normalize_person_name(${nome}) as normalizado`,
  )
  if ((linha?.normalizado ?? '').length < 3) {
    throw new FalhaDaAction('validation_error', 'Confira os campos destacados.', {
      fullName: [
        'O nome precisa de pelo menos 3 letras além de de, da, do, das, dos e e.',
      ],
    })
  }
}

function eCpfRepetido(erro: unknown) {
  const causa = erro instanceof Error && erro.cause ? erro.cause : erro
  return (
    typeof causa === 'object' &&
    causa !== null &&
    (causa as { code?: string }).code === '23505' &&
    String((causa as { constraint_name?: string }).constraint_name ?? '').includes('cpf')
  )
}

const opcional = z.string().max(300).nullable().optional()

export const updateParticipant = defineAction({
  nome: 'participant.update',
  entidade: 'participants',
  papelMinimo: 'editor',
  // Ausente não muda; nulo apaga (o mesmo contrato do updateEvent).
  schema: z.object({
    id: z.uuid(),
    fullName: z.string().max(300).optional(),
    email: opcional,
    birthDate: opcional,
    cpf: opcional,
  }),
  async executar({ entrada, tx, usuario }) {
    const [atual] = await tx
      .select({ pessoa: participants, sal: events.cpfSalt })
      .from(participants)
      .innerJoin(events, eq(events.id, participants.eventId))
      .where(eq(participants.id, entrada.id))
      .for('update')
    if (!atual) throw new FalhaDaAction('not_found', 'Não encontramos essa pessoa.')

    const pepper = serverEnv().CPF_PEPPER
    const identidade = validateIdentity(
      {
        full_name: entrada.fullName ?? atual.pessoa.fullName,
        cpf: entrada.cpf ?? '',
        birth_date: entrada.birthDate ?? '',
        email: entrada.email ?? '',
      },
      { hashCpf: (cpf) => hmacCpf(pepper, atual.sal, cpf), today: new Date() },
    )
    recusarProblemas(identidade.issues)
    await exigirNomeUtil(tx, identidade.fullName!)

    const mudancas: Partial<typeof participants.$inferInsert> = {}
    if (entrada.fullName !== undefined) mudancas.fullName = identidade.fullName!
    if (entrada.email !== undefined) mudancas.email = identidade.email
    if (entrada.birthDate !== undefined) mudancas.birthDate = identidade.birthDate
    if (entrada.cpf !== undefined) {
      mudancas.cpfHash = identidade.cpfHash
      mudancas.cpfLast3 = identidade.cpfLast3
    }

    try {
      await tx.update(participants).set(mudancas).where(eq(participants.id, entrada.id))
    } catch (erro) {
      if (eCpfRepetido(erro)) {
        throw new FalhaDaAction(
          'conflict',
          'Outra pessoa deste evento já tem esse CPF.',
          {
            cpf: ['Outra pessoa deste evento já tem esse CPF.'],
          },
        )
      }
      throw erro
    }

    // Nome corrigido à mão resolve o pedido de correção pendente da pessoa
    // (doc 07): a fila fica coerente enquanto a tela de revisão não existe.
    if (mudancas.fullName !== undefined && mudancas.fullName !== atual.pessoa.fullName) {
      await tx
        .update(nameCorrectionRequests)
        .set({ status: 'approved', reviewedBy: usuario.id, reviewedAt: new Date() })
        .where(
          and(
            eq(nameCorrectionRequests.status, 'pending'),
            inArray(
              nameCorrectionRequests.certificateId,
              tx
                .select({ id: certificates.id })
                .from(certificates)
                .where(eq(certificates.participantId, entrada.id)),
            ),
          ),
        )
    }

    return {
      data: undefined,
      entityId: entrada.id,
      diff: { fields: Object.keys(mudancas).filter((campo) => campo !== 'cpfLast3') },
    }
  },
})

/** Os campos de conteúdo do modelo publicado, ou do rascunho se ainda não publicou. */
async function camposDoCertificado(tx: Transaction, tipoId: string) {
  const [modelo] = await tx
    .select({
      dataFields: certificateTemplates.dataFields,
      snapshot: certificateTemplates.publishedSnapshot,
    })
    .from(participationTypes)
    .innerJoin(
      certificateTemplates,
      eq(certificateTemplates.id, participationTypes.certificateTemplateId),
    )
    .where(eq(participationTypes.id, tipoId))
  if (!modelo) return null
  const doSnapshot = (modelo.snapshot as { data_fields?: unknown } | null)?.data_fields
  return z.array(dataFieldSchema).safeParse(doSnapshot ?? modelo.dataFields).data ?? []
}

export const updateCertificate = defineAction({
  nome: 'certificate.update',
  entidade: 'certificates',
  papelMinimo: 'editor',
  schema: z.object({
    id: z.uuid(),
    hours: z.string().max(20).optional(),
    data: z.record(z.string(), z.string().max(300)).optional(),
  }),
  async executar({ entrada, tx }) {
    const [certificado] = await tx
      .select()
      .from(certificates)
      .where(eq(certificates.id, entrada.id))
      .for('update')
    if (!certificado)
      throw new FalhaDaAction('not_found', 'Não encontramos esse certificado.')
    if (certificado.status !== 'active') {
      throw new FalhaDaAction(
        'conflict',
        'Certificado revogado ou removido não se edita.',
      )
    }

    const mudancas: Partial<typeof certificates.$inferInsert> = {}
    if (entrada.hours !== undefined) {
      const horas = parseHours(entrada.hours)
      if (horas === null) {
        throw new FalhaDaAction('validation_error', 'Confira os campos destacados.', {
          hours: ['Use um número de 0 a 9.999,9, como 8 ou 1,5.'],
        })
      }
      mudancas.hours = String(horas)
    }
    if (entrada.data !== undefined) {
      const campos =
        (await camposDoCertificado(tx, certificado.participationTypeId)) ?? []
      const validado = buildDataSchema(campos).safeParse(entrada.data)
      if (!validado.success) {
        const fieldErrors: Record<string, string[]> = {}
        for (const problema of validado.error.issues) {
          ;(fieldErrors[`data.${String(problema.path[0])}`] ??= []).push(problema.message)
        }
        throw new FalhaDaAction(
          'validation_error',
          'Confira os campos destacados.',
          fieldErrors,
        )
      }
      mudancas.data = validado.data
    }
    if (Object.keys(mudancas).length > 0) {
      await tx.update(certificates).set(mudancas).where(eq(certificates.id, entrada.id))
    }
    return {
      data: undefined,
      entityId: entrada.id,
      diff: { fields: Object.keys(mudancas) },
    }
  },
})

export const createCertificateManually = defineAction({
  nome: 'certificate.create_manual',
  entidade: 'certificates',
  papelMinimo: 'editor',
  schema: z.object({
    eventId: z.uuid(),
    participationTypeId: z.uuid(),
    participantId: z.uuid().optional(),
    participant: z
      .object({
        fullName: z.string().max(300),
        email: z.string().max(300).optional(),
        birthDate: z.string().max(30).optional(),
        cpf: z.string().max(30).optional(),
      })
      .optional(),
    hours: z.string().max(20).optional(),
    data: z.record(z.string(), z.string().max(300)).default({}),
  }),
  async executar({ entrada, tx }) {
    const contexto = await loadImportContext(tx, entrada.eventId)
    if (!contexto) throw new FalhaDaAction('not_found', 'Não encontramos esse evento.')
    const tipo = contexto.types.find(
      (candidato) => candidato.id === entrada.participationTypeId,
    )
    if (!tipo)
      throw new FalhaDaAction(
        'not_found',
        'Esse tipo de participação não é deste evento.',
      )

    const pepper = serverEnv().CPF_PEPPER
    let participanteId = entrada.participantId
    let nome: string
    if (participanteId) {
      const [pessoa] = await tx
        .select({ nome: participants.fullName })
        .from(participants)
        .where(
          and(
            eq(participants.id, participanteId),
            eq(participants.eventId, entrada.eventId),
          ),
        )
      if (!pessoa) throw new FalhaDaAction('not_found', 'Essa pessoa não é deste evento.')
      nome = pessoa.nome
    } else if (entrada.participant) {
      nome = entrada.participant.fullName
    } else {
      throw new FalhaDaAction(
        'validation_error',
        'Escolha uma pessoa do evento ou preencha uma nova.',
      )
    }

    // A mesma validação da importação, para uma linha só (doc 07).
    const celulas = Object.fromEntries(
      Object.entries(entrada.data).map(([chave, valor]) => [`data.${chave}`, valor]),
    )
    const linha = validateRow(
      2,
      {
        full_name: nome,
        cpf: entrada.participantId ? '' : (entrada.participant?.cpf ?? ''),
        birth_date: entrada.participantId ? '' : (entrada.participant?.birthDate ?? ''),
        email: entrada.participantId ? '' : (entrada.participant?.email ?? ''),
        hours: entrada.hours ?? '',
        ...celulas,
      },
      {
        types: contexto.types,
        fixedTypeId: tipo.id,
        search: contexto.event.search,
        hashCpf: (cpf) => hmacCpf(pepper, contexto.event.cpfSalt, cpf),
        today: new Date(),
      },
    )
    recusarProblemas(linha.issues)

    if (!participanteId) {
      await exigirNomeUtil(tx, linha.fullName!)
      try {
        const [nova] = await tx
          .insert(participants)
          .values({
            eventId: entrada.eventId,
            fullName: linha.fullName!,
            cpfHash: linha.cpfHash,
            cpfLast3: linha.cpfLast3,
            birthDate: linha.birthDate,
            email: linha.email,
          })
          .returning({ id: participants.id })
        participanteId = nova!.id
      } catch (erro) {
        if (eCpfRepetido(erro)) {
          throw new FalhaDaAction(
            'conflict',
            'Já existe uma pessoa com esse CPF neste evento: escolha-a na lista.',
            {
              cpf: ['Já existe uma pessoa com esse CPF neste evento.'],
            },
          )
        }
        throw erro
      }
    }

    const [evento] = await tx
      .select({ liberado: events.certificatesReleasedAt })
      .from(events)
      .where(eq(events.id, entrada.eventId))
    const [jaTem] = await tx
      .select({ id: certificates.id })
      .from(certificates)
      .where(
        and(
          eq(certificates.participantId, participanteId),
          eq(certificates.participationTypeId, tipo.id),
        ),
      )
    if (jaTem) {
      throw new FalhaDaAction(
        'conflict',
        `Essa pessoa já tem certificado de ${tipo.label} neste evento.`,
      )
    }
    const [certificado] = await tx
      .insert(certificates)
      .values({
        eventId: entrada.eventId,
        participantId: participanteId,
        participationTypeId: tipo.id,
        // Sem horas, o trigger usa a do tipo; o padrão do modelo entra no novo.
        hours: linha.hours === null ? sql`null` : String(linha.hours),
        data: { ...linha.dataDefaults, ...linha.data },
        issuedAt: evento?.liberado ? new Date() : null,
      })
      .returning({ id: certificates.id, code: certificates.code })

    return {
      data: {
        certificateId: certificado!.id,
        participantId: participanteId,
        code: certificado!.code,
      },
      entityId: certificado!.id,
      diff: { participant: entrada.participantId ? 'existing' : 'new' },
    }
  },
})

export const revokeCertificate = defineAction({
  nome: 'certificate.revoke',
  entidade: 'certificates',
  papelMinimo: 'editor',
  schema: z.object({
    id: z.uuid(),
    reason: z
      .string()
      .trim()
      .min(10, 'Escreva o motivo, com pelo menos 10 caracteres.')
      .max(500),
  }),
  async executar({ entrada, tx, usuario }) {
    const [alterado] = await tx
      .update(certificates)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedReason: entrada.reason,
        revokedBy: usuario.id,
      })
      .where(and(eq(certificates.id, entrada.id), eq(certificates.status, 'active')))
      .returning({ eventId: certificates.eventId })
    if (!alterado)
      throw new FalhaDaAction('conflict', 'Só um certificado válido pode ser revogado.')
    const [evento] = await tx
      .select({ slug: events.slug })
      .from(events)
      .where(eq(events.id, alterado.eventId))
    return {
      data: undefined,
      entityId: entrada.id,
      diff: { status: ['active', 'revoked'] },
      tags: evento ? [`event:${evento.slug}`] : [],
    }
  },
})

export const restoreCertificate = defineAction({
  nome: 'certificate.restore',
  entidade: 'certificates',
  papelMinimo: 'editor',
  schema: z.object({ id: z.uuid() }),
  async executar({ entrada, tx }) {
    const [alterado] = await tx
      .update(certificates)
      .set({ status: 'active', revokedAt: null, revokedReason: null, revokedBy: null })
      .where(and(eq(certificates.id, entrada.id), eq(certificates.status, 'revoked')))
      .returning({ eventId: certificates.eventId })
    if (!alterado)
      throw new FalhaDaAction(
        'conflict',
        'Só um certificado revogado pode ser restaurado.',
      )
    const [evento] = await tx
      .select({ slug: events.slug })
      .from(events)
      .where(eq(events.id, alterado.eventId))
    return {
      data: undefined,
      entityId: entrada.id,
      diff: { status: ['revoked', 'active'] },
      tags: evento ? [`event:${evento.slug}`] : [],
    }
  },
})

/**
 * ADR-0007: nunca baixado e evento ainda não liberado é apagado de verdade (e
 * a pessoa, se ficar sem certificado); qualquer outro caso recusa a operação
 * inteira e devolve, em `fieldErrors.certificateIds`, os que pedem revogação.
 */
export const removeCertificates = defineAction({
  nome: 'certificate.remove',
  entidade: 'certificates',
  papelMinimo: 'editor',
  schema: z
    .object({
      eventId: z.uuid(),
      certificateIds: z.array(z.uuid()).min(1).max(500),
      confirmCount: z.int(),
    })
    .refine((entrada) => entrada.confirmCount === entrada.certificateIds.length, {
      message: 'Digite a quantidade de certificados selecionados para confirmar.',
      path: ['confirmCount'],
    }),
  async executar({ entrada, tx, usuario }) {
    const [evento] = await tx
      .select({ liberado: events.certificatesReleasedAt, slug: events.slug })
      .from(events)
      .where(eq(events.id, entrada.eventId))
    if (!evento) throw new FalhaDaAction('not_found', 'Não encontramos esse evento.')
    if (evento.liberado && !hasRole(usuario.role, 'admin')) {
      throw new FalhaDaAction(
        'forbidden',
        'Depois da liberação, só quem administra remove certificados.',
      )
    }

    const alvos = await tx
      .select({
        id: certificates.id,
        participantId: certificates.participantId,
        baixado: certificates.firstDownloadedAt,
        lote: certificates.createdByBatchId,
      })
      .from(certificates)
      .where(
        and(
          eq(certificates.eventId, entrada.eventId),
          inArray(certificates.id, entrada.certificateIds),
        ),
      )
      .for('update')
    if (alvos.length !== entrada.certificateIds.length) {
      throw new FalhaDaAction('not_found', 'Alguns certificados não são deste evento.')
    }

    const pedemRevogacao = alvos.filter(
      (alvo) => evento.liberado !== null || alvo.baixado !== null,
    )
    if (pedemRevogacao.length > 0) {
      throw new FalhaDaAction(
        'must_revoke',
        evento.liberado
          ? 'Os certificados deste evento já foram liberados: em vez de remover, revogue, com o motivo.'
          : `${pedemRevogacao.length} dos certificados selecionados já foram baixados: esses não se removem, se revogam.`,
        { certificateIds: pedemRevogacao.map((alvo) => alvo.id) },
      )
    }

    await tx.delete(certificates).where(inArray(certificates.id, entrada.certificateIds))
    const pessoas = [
      ...new Set(
        alvos.map((alvo) => alvo.participantId).filter((id): id is string => id !== null),
      ),
    ]
    const semCertificado = await tx
      .delete(participants)
      .where(
        and(
          inArray(participants.id, pessoas),
          sql`not exists (select 1 from ${certificates} c where c.participant_id = ${participants.id})`,
        ),
      )
      .returning({ id: participants.id })

    const lotes = [...new Set(alvos.map((alvo) => alvo.lote).filter(Boolean))]
    return {
      data: { removed: alvos.length, participantsRemoved: semCertificado.length },
      entityId: entrada.eventId,
      diff: {
        removed: alvos.length,
        participantsRemoved: semCertificado.length,
        batches: lotes,
      },
      tags: [`event:${evento.slug}`],
    }
  },
})
