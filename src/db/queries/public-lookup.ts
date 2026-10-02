import 'server-only'

import { and, eq, sql } from 'drizzle-orm'

import type { Transaction } from '@/db/client'
import { events, participants, searchAttempts } from '@/db/schema'

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
    birthDate: boolean
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
      birthDate: evento.birthDate,
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
