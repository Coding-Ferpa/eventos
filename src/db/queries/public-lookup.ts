import 'server-only'

import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { db, type Transaction } from '@/db/client'
import {
  certificateDownloads,
  certificateTemplates,
  certificates,
  events,
  nameCorrectionRequests,
  participants,
  participationTypes,
  searchAttempts,
  validationChecks,
} from '@/db/schema'
import type { DataValue } from '@/features/certificate/data-schema'
import {
  templateSnapshotSchema,
  type TemplateSnapshot,
} from '@/features/certificate/schema'
import type { TokenContext } from '@/features/certificate/tokens'
import { logger } from '@/lib/logger'

/**
 * A única porta da área pública para dado de pessoa (doc 08, ADR-0012). Só as
 * rotas públicas de certificado importam este arquivo (regra de lint), e
 * sempre depois do rate limit.
 *
 * Cada função tem o tipo de retorno escrito à mão, nunca o da tabela: o que sai
 * daqui é uma lista branca. Um teste afirma que nenhum retorno traz as chaves
 * `id`, `participant_id`, `cpf_hash`, `email` ou `birth_date`. A exceção
 * deliberada é `pids`, que só existe para virar o cookie cifrado de retirada.
 */

// --- Evento -------------------------------------------------------------------

export type EventoParaBusca = {
  eventId: string
  status: string
  cpfSalt: string
  search: {
    byCpf: boolean
    byEmail: boolean
    byName: boolean
    /** A data de nascimento como segundo fator do nome (ADR-0009). */
    birthDateRequired: boolean
    mode: 'any' | 'all'
  }
}

export async function getEventForSearch(
  tx: Transaction,
  slug: string,
): Promise<EventoParaBusca | null> {
  const [evento] = await tx
    .select({
      eventId: events.id,
      status: events.status,
      cpfSalt: events.cpfSalt,
      byCpf: events.searchByCpf,
      byEmail: events.searchByEmail,
      byName: events.searchByName,
      birthDate: events.searchBirthDate,
      mode: events.searchMode,
    })
    .from(events)
    .where(eq(events.slug, slug))
  if (!evento) return null
  return {
    eventId: evento.eventId,
    status: evento.status,
    cpfSalt: evento.cpfSalt,
    search: {
      byCpf: evento.byCpf,
      byEmail: evento.byEmail,
      byName: evento.byName,
      birthDateRequired: evento.birthDate,
      mode: evento.mode,
    },
  }
}

// --- Busca --------------------------------------------------------------------

/** O que a busca procura. Ausente é "este campo não faz parte desta busca". */
export type CriteriosDeBusca = {
  cpfHash?: string
  email?: string
  fullName?: string
  birthDate?: string
}

export type ResultadoDaBusca =
  { outcome: 'found'; pids: string[] } | { outcome: 'not_found' | 'ambiguous' }

/**
 * Igualdade sobre valor normalizado inteiro, nunca `like` (doc 08). Mais de uma
 * pessoa é `ambiguous`, que para fora é idêntico a `not_found`. A consulta
 * roda sempre, encontrando ou não: nenhum atalho que mude o tempo de resposta.
 */
export async function findParticipant(
  tx: Transaction,
  eventId: string,
  criterios: CriteriosDeBusca,
): Promise<ResultadoDaBusca> {
  const linhas = await tx
    .select({ pid: participants.id })
    .from(participants)
    .where(
      and(
        eq(participants.eventId, eventId),
        criterios.cpfHash !== undefined
          ? eq(participants.cpfHash, criterios.cpfHash)
          : undefined,
        criterios.email !== undefined
          ? eq(participants.email, criterios.email)
          : undefined,
        criterios.fullName !== undefined
          ? sql`${participants.fullNameNormalized} = public.normalize_person_name(${criterios.fullName})`
          : undefined,
        criterios.birthDate !== undefined
          ? eq(participants.birthDate, criterios.birthDate)
          : undefined,
      ),
    )
    .limit(2)
  if (linhas.length === 1) return { outcome: 'found', pids: [linhas[0]!.pid] }
  return { outcome: linhas.length === 0 ? 'not_found' : 'ambiguous' }
}

export type MetodoDeBusca = 'cpf' | 'email' | 'name' | 'all'
export type DesfechoDaBusca =
  'found' | 'not_found' | 'ambiguous' | 'rate_limited' | 'event_unavailable'

/** O log da tentativa: método e desfecho, nunca o valor buscado (doc 08). */
export async function recordSearchAttempt(
  tx: Transaction,
  tentativa: {
    eventId: string
    method: MetodoDeBusca
    outcome: DesfechoDaBusca
    ipHash: string
    deviceHash: string
  },
): Promise<void> {
  await tx.insert(searchAttempts).values(tentativa)
}

// --- Retirada -----------------------------------------------------------------

export type CertificadoNaRetirada = {
  code: string
  status: 'active' | 'revoked'
  typeLabel: string
  hours: number
  issuedAt: Date | null
  sequence: number
  data: Record<string, DataValue>
  /** O modelo publicado do tipo; nulo se não houver (a tela não mostra prévia). */
  snapshot: TemplateSnapshot | null
}

export type PessoaNaRetirada = {
  fullName: string
  cpfLast3: string | null
  /** Pedido de correção em análise para algum certificado da pessoa (doc 03, 6c). */
  correctionPending: boolean
  certificates: CertificadoNaRetirada[]
}

export type EventoNaRetirada = {
  slug: string
  title: string
  locationName: string | null
  city: string | null
  startsAt: Date
  endsAt: Date | null
  contactEmail: string | null
  contactUrl: string | null
}

/**
 * A tela de retirada (doc 07): as pessoas do cookie, naquele evento, com os
 * certificados ativos e os revogados (que aparecem como aviso: "não
 * encontrado" seria mentira). O apagado a pedido do titular não aparece.
 */
export async function getRetrieval(
  slug: string,
  pids: string[],
): Promise<{ event: EventoNaRetirada; people: PessoaNaRetirada[] } | null> {
  const [evento] = await db()
    .select({
      eventId: events.id,
      slug: events.slug,
      title: events.title,
      locationName: events.locationName,
      city: events.city,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      contactEmail: events.contactEmail,
      contactUrl: events.contactUrl,
      status: events.status,
    })
    .from(events)
    .where(eq(events.slug, slug))
  if (!evento || !['certificates_available', 'archived'].includes(evento.status))
    return null

  const linhas = await db()
    .select({
      pid: participants.id,
      fullName: participants.fullName,
      cpfLast3: participants.cpfLast3,
      code: certificates.code,
      status: certificates.status,
      hours: certificates.hours,
      issuedAt: certificates.issuedAt,
      sequence: certificates.sequenceNumber,
      data: certificates.data,
      typeLabel: participationTypes.label,
      ordem: participationTypes.sortOrder,
      snapshot: certificateTemplates.publishedSnapshot,
      pendente: sql<boolean>`exists (
        select 1 from public.name_correction_requests r
         where r.certificate_id = ${certificates.id} and r.status = 'pending')`,
    })
    .from(participants)
    .innerJoin(certificates, eq(certificates.participantId, participants.id))
    .innerJoin(
      participationTypes,
      eq(participationTypes.id, certificates.participationTypeId),
    )
    .leftJoin(
      certificateTemplates,
      eq(certificateTemplates.id, participationTypes.certificateTemplateId),
    )
    .where(
      and(
        eq(participants.eventId, evento.eventId),
        inArray(participants.id, pids),
        inArray(certificates.status, ['active', 'revoked']),
      ),
    )
    // A numeração desempata tipos com a mesma ordem: sem ela, o Postgres
    // devolve o empate em qualquer ordem (o teste da retirada piscava).
    .orderBy(
      asc(participants.fullName),
      asc(participationTypes.sortOrder),
      asc(certificates.sequenceNumber),
    )

  const porPessoa = new Map<string, PessoaNaRetirada>()
  for (const linha of linhas) {
    const pessoa = porPessoa.get(linha.pid) ?? {
      fullName: linha.fullName,
      cpfLast3: linha.cpfLast3,
      correctionPending: false,
      certificates: [],
    }
    pessoa.correctionPending ||= linha.pendente
    pessoa.certificates.push({
      code: linha.code,
      status: linha.status as 'active' | 'revoked',
      typeLabel: linha.typeLabel,
      hours: Number(linha.hours),
      issuedAt: linha.issuedAt,
      sequence: linha.sequence,
      data: linha.data as Record<string, DataValue>,
      snapshot: templateSnapshotSchema.safeParse(linha.snapshot).data ?? null,
    })
    porPessoa.set(linha.pid, pessoa)
  }

  const { eventId: _, status: __, ...publico } = evento
  return { event: publico, people: [...porPessoa.values()] }
}

// --- Pedido de correção -------------------------------------------------------

export type PedidoDeCorrecao =
  | {
      outcome: 'created'
      /** Para o e-mail à organização: só sai do servidor por ele. */
      aviso: {
        evento: string
        nomeAtual: string
        para: string | null
        caminhoNoAdmin: string
      }
    }
  | { outcome: 'not_found' }
  | { outcome: 'pending' }

/**
 * O pedido de "meu nome está errado" (doc 07). O certificado precisa ser de uma
 * pessoa do cookie e estar ativo; de outra pessoa, revogado ou inexistente,
 * responde igual. Pedido pendente para o mesmo certificado recusa o novo.
 */
export async function createCorrectionRequest(
  tx: Transaction,
  code: string,
  pids: string[],
  pedido: { requestedName: string; contact: string; message: string | null },
): Promise<PedidoDeCorrecao> {
  const [alvo] = await tx
    .select({
      certificateId: certificates.id,
      nomeAtual: participants.fullName,
      eventId: events.id,
      evento: events.title,
      contato: events.contactEmail,
    })
    .from(certificates)
    .innerJoin(participants, eq(participants.id, certificates.participantId))
    .innerJoin(events, eq(events.id, certificates.eventId))
    .where(
      and(
        eq(certificates.code, code),
        inArray(certificates.participantId, pids),
        eq(certificates.status, 'active'),
      ),
    )
    .for('update', { of: certificates })
  if (!alvo) return { outcome: 'not_found' }

  const [pendente] = await tx
    .select({ status: nameCorrectionRequests.status })
    .from(nameCorrectionRequests)
    .where(
      and(
        eq(nameCorrectionRequests.certificateId, alvo.certificateId),
        eq(nameCorrectionRequests.status, 'pending'),
      ),
    )
  if (pendente) return { outcome: 'pending' }

  await tx.insert(nameCorrectionRequests).values({
    certificateId: alvo.certificateId,
    currentName: alvo.nomeAtual,
    requestedName: pedido.requestedName,
    contact: pedido.contact,
    message: pedido.message,
  })
  return {
    outcome: 'created',
    aviso: {
      evento: alvo.evento,
      nomeAtual: alvo.nomeAtual,
      para: alvo.contato,
      caminhoNoAdmin: `/admin/eventos/${alvo.eventId}/participantes?busca=${encodeURIComponent(alvo.nomeAtual)}`,
    },
  }
}

// --- Download -----------------------------------------------------------------

export type CertificadoParaDownload =
  | { outcome: 'not_found' }
  | { outcome: 'other_person'; eventSlug: string }
  | { outcome: 'revoked'; eventSlug: string }
  | { outcome: 'erased'; eventSlug: string }
  | {
      outcome: 'found'
      eventSlug: string
      snapshot: TemplateSnapshot | null
      certificateVersion: number
      context: Omit<TokenContext, 'siteUrl'>
    }

/**
 * O certificado do link de download (doc 07). Código de outra pessoa responde
 * como inexistente, para fora; `other_person` só existe aqui dentro, para a
 * rota saber que pode redirecionar quem perdeu o cookie.
 */
export async function getCertificateForDownload(
  code: string,
  pids: string[],
): Promise<CertificadoParaDownload> {
  const [linha] = await db()
    .select({
      pid: certificates.participantId,
      status: certificates.status,
      version: certificates.version,
      hours: certificates.hours,
      issuedAt: certificates.issuedAt,
      sequence: certificates.sequenceNumber,
      data: certificates.data,
      fullName: participants.fullName,
      cpfLast3: participants.cpfLast3,
      typeLabel: participationTypes.label,
      eventSlug: events.slug,
      title: events.title,
      locationName: events.locationName,
      city: events.city,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      snapshot: certificateTemplates.publishedSnapshot,
    })
    .from(certificates)
    .innerJoin(events, eq(events.id, certificates.eventId))
    .innerJoin(
      participationTypes,
      eq(participationTypes.id, certificates.participationTypeId),
    )
    .leftJoin(participants, eq(participants.id, certificates.participantId))
    .leftJoin(
      certificateTemplates,
      eq(certificateTemplates.id, participationTypes.certificateTemplateId),
    )
    .where(eq(certificates.code, code))
  if (!linha) return { outcome: 'not_found' }
  if (linha.status === 'erased') return { outcome: 'erased', eventSlug: linha.eventSlug }
  if (!linha.pid || !pids.includes(linha.pid))
    return { outcome: 'other_person', eventSlug: linha.eventSlug }
  if (linha.status === 'revoked')
    return { outcome: 'revoked', eventSlug: linha.eventSlug }
  return {
    outcome: 'found',
    eventSlug: linha.eventSlug,
    snapshot: templateSnapshotSchema.safeParse(linha.snapshot).data ?? null,
    certificateVersion: linha.version,
    context: {
      participant: { fullName: linha.fullName!, cpfLast3: linha.cpfLast3 },
      event: {
        title: linha.title,
        locationName: linha.locationName,
        city: linha.city,
        startsAt: linha.startsAt,
        endsAt: linha.endsAt,
      },
      participation: { label: linha.typeLabel },
      certificate: {
        hours: Number(linha.hours),
        code,
        issuedAt: linha.issuedAt,
        sequence: linha.sequence,
        data: linha.data as Record<string, DataValue>,
      },
    },
  }
}

/**
 * O download que saiu (doc 10): o log e os contadores do certificado. Roda em
 * `after()`, fora do caminho da resposta.
 */
export async function recordDownload(
  code: string,
  registro: { source: 'search' | 'email_link' | 'my_certificates'; deviceHash: string },
): Promise<void> {
  await db().transaction(async (tx) => {
    const [certificado] = await tx
      .update(certificates)
      .set({
        downloadCount: sql`${certificates.downloadCount} + 1`,
        firstDownloadedAt: sql`coalesce(${certificates.firstDownloadedAt}, now())`,
        lastDownloadedAt: sql`now()`,
      })
      .where(eq(certificates.code, code))
      .returning({
        id: certificates.id,
        eventId: certificates.eventId,
        version: certificates.version,
      })
    if (!certificado) return
    await tx.insert(certificateDownloads).values({
      certificateId: certificado.id,
      eventId: certificado.eventId,
      source: registro.source,
      certificateVersion: certificado.version,
      deviceHash: registro.deviceHash,
    })
  })
}

/**
 * Falha do motor (doc 05): o contador do dia de São Paulo, que o rollup nunca
 * reescreve, e o log com os ids, sem nome.
 */
export async function recordPdfFailure(code: string): Promise<void> {
  const [alvo] = await db()
    .select({
      certificateId: certificates.id,
      eventId: certificates.eventId,
      templateId: participationTypes.certificateTemplateId,
    })
    .from(certificates)
    .innerJoin(
      participationTypes,
      eq(participationTypes.id, certificates.participationTypeId),
    )
    .where(eq(certificates.code, code))
  if (!alvo) return
  logger.error({
    event: 'pdf.failed',
    route: '/api/certificados/[codigo]/pdf',
    certificate_id: alvo.certificateId,
    template_id: alvo.templateId,
  })
  await db().execute(sql`
    insert into public.event_stats_daily (event_id, day, pdf_failures)
    values (${alvo.eventId}, (now() at time zone 'America/Sao_Paulo')::date, 1)
    on conflict (event_id, day) do update set pdf_failures = public.event_stats_daily.pdf_failures + 1`)
}

// --- Validação ----------------------------------------------------------------

type DadosDaValidacao = {
  fullName: string
  eventTitle: string
  eventSlug: string
  typeLabel: string
  hours: number
  eventStartsAt: Date
  eventEndsAt: Date | null
  issuedAt: Date
}

export type ValidacaoPublica =
  | ({ outcome: 'valid'; contentUpdatedAt: Date | null } & DadosDaValidacao)
  | ({ outcome: 'revoked'; revokedAt: Date } & DadosDaValidacao)
  | { outcome: 'erased' }
  | { outcome: 'not_found' }

/**
 * `/validar/{codigo}` (doc 07): o estado do certificado e o que a página pode
 * mostrar dele, e o registro da consulta em `validation_checks`. Certificado
 * ainda não emitido (evento não liberado) responde como inexistente: o código
 * não é público antes da liberação. Do apagado a pedido, nem o nome sai.
 */
export async function validateCertificate(
  code: string,
  ipHash: string,
): Promise<ValidacaoPublica> {
  const [linha] = await db()
    .select({
      certificateId: certificates.id,
      status: certificates.status,
      version: certificates.version,
      contentUpdatedAt: certificates.contentUpdatedAt,
      issuedAt: certificates.issuedAt,
      revokedAt: certificates.revokedAt,
      hours: certificates.hours,
      fullName: participants.fullName,
      typeLabel: participationTypes.label,
      eventTitle: events.title,
      eventSlug: events.slug,
      eventStartsAt: events.startsAt,
      eventEndsAt: events.endsAt,
    })
    .from(certificates)
    .innerJoin(events, eq(events.id, certificates.eventId))
    .innerJoin(
      participationTypes,
      eq(participationTypes.id, certificates.participationTypeId),
    )
    .leftJoin(participants, eq(participants.id, certificates.participantId))
    .where(eq(certificates.code, code))

  const resultado: ValidacaoPublica =
    !linha || (linha.status !== 'erased' && linha.issuedAt === null)
      ? { outcome: 'not_found' }
      : linha.status === 'erased'
        ? { outcome: 'erased' }
        : (() => {
            const dados: DadosDaValidacao = {
              fullName: linha.fullName!,
              eventTitle: linha.eventTitle,
              eventSlug: linha.eventSlug,
              typeLabel: linha.typeLabel,
              hours: Number(linha.hours),
              eventStartsAt: linha.eventStartsAt,
              eventEndsAt: linha.eventEndsAt,
              issuedAt: linha.issuedAt!,
            }
            return linha.status === 'revoked'
              ? { outcome: 'revoked' as const, revokedAt: linha.revokedAt!, ...dados }
              : {
                  outcome: 'valid' as const,
                  contentUpdatedAt: linha.version > 1 ? linha.contentUpdatedAt : null,
                  ...dados,
                }
          })()

  await db()
    .insert(validationChecks)
    .values({
      certificateId:
        resultado.outcome === 'not_found' ? null : (linha?.certificateId ?? null),
      outcome: resultado.outcome,
      ipHash,
    })
  return resultado
}
