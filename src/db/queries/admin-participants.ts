import 'server-only'

import { and, asc, count, desc, eq, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import {
  certificates,
  importBatches,
  nameCorrectionRequests,
  participants,
  participationTypes,
} from '@/db/schema'

/**
 * A lista de participantes do admin (doc 06): um certificado por linha,
 * filtrável pelo lote que o criou (ADR-0007), que é o que resolve "importei a
 * planilha errada". A busca por nome do admin pode ser parcial; a pública,
 * nunca (doc 08).
 */

export const CERTIFICADOS_POR_PAGINA = 50

export type FiltrosDeParticipantes = {
  lote: string | null
  busca: string
  pagina: number
}

export async function listarCertificadosDoEvento(
  eventId: string,
  filtros: FiltrosDeParticipantes,
) {
  const condicoes = and(
    eq(certificates.eventId, eventId),
    filtros.lote ? eq(certificates.createdByBatchId, filtros.lote) : undefined,
    filtros.busca
      ? sql`${participants.fullNameNormalized} like '%' || public.normalize_person_name(${filtros.busca}) || '%'`
      : undefined,
  )

  const [linhas, [total]] = await Promise.all([
    db()
      .select({
        certificateId: certificates.id,
        code: certificates.code,
        status: certificates.status,
        hours: certificates.hours,
        data: certificates.data,
        baixado: certificates.firstDownloadedAt,
        loteId: certificates.createdByBatchId,
        participantId: participants.id,
        fullName: participants.fullName,
        email: participants.email,
        birthDate: participants.birthDate,
        cpfLast3: participants.cpfLast3,
        tipo: participationTypes.label,
        tipoId: participationTypes.id,
        // O pedido de correção pendente (um por certificado, pelo índice
        // parcial): é aqui que o link do e-mail de aviso traz o admin (doc 07).
        correcaoNome: nameCorrectionRequests.requestedName,
        correcaoContato: nameCorrectionRequests.contact,
      })
      .from(certificates)
      .innerJoin(participants, eq(participants.id, certificates.participantId))
      .innerJoin(
        participationTypes,
        eq(participationTypes.id, certificates.participationTypeId),
      )
      .leftJoin(
        nameCorrectionRequests,
        and(
          eq(nameCorrectionRequests.certificateId, certificates.id),
          eq(nameCorrectionRequests.status, 'pending'),
        ),
      )
      .where(condicoes)
      .orderBy(asc(participants.fullNameNormalized), asc(participationTypes.sortOrder))
      .limit(CERTIFICADOS_POR_PAGINA)
      .offset((filtros.pagina - 1) * CERTIFICADOS_POR_PAGINA),
    db()
      .select({ total: count() })
      .from(certificates)
      .innerJoin(participants, eq(participants.id, certificates.participantId))
      .where(condicoes),
  ])

  return { linhas, total: total?.total ?? 0 }
}

/** Os lotes aplicados do evento, do mais recente para o mais antigo. */
export async function listarLotesAplicados(eventId: string) {
  return db()
    .select({
      id: importBatches.id,
      fileName: importBatches.fileName,
      appliedAt: importBatches.appliedAt,
      rowCount: importBatches.rowCount,
    })
    .from(importBatches)
    .where(and(eq(importBatches.eventId, eventId), eq(importBatches.status, 'applied')))
    .orderBy(desc(importBatches.appliedAt))
}
