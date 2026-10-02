import 'server-only'

import { and, count, desc, eq, ilike } from 'drizzle-orm'

import { db } from '@/db/client'
import { certificates, events, participationTypes } from '@/db/schema'
import type { StatusDoEvento } from '@/lib/schemas/event'

/**
 * Leituras do admin de eventos. Vão pela conexão privilegiada, sem a RLS: as
 * páginas que as chamam já passaram pelo guarda de papel do layout (doc 08).
 * O `cpf_salt` nunca é selecionado: ele não sai do servidor (ADR-0005).
 */

export const EVENTOS_POR_PAGINA = 20

/** `%` e `_` digitados na busca são texto, e não curinga do `like`. */
function escaparLike(texto: string) {
  return texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)
}

export async function listarEventosDoAdmin(filtros: {
  status: StatusDoEvento | null
  busca: string
  pagina: number
}) {
  const onde = and(
    filtros.status ? eq(events.status, filtros.status) : undefined,
    filtros.busca.trim()
      ? ilike(events.title, `%${escaparLike(filtros.busca.trim())}%`)
      : undefined,
  )

  const [linhas, [total]] = await Promise.all([
    db()
      .select({
        id: events.id,
        slug: events.slug,
        title: events.title,
        status: events.status,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        updatedAt: events.updatedAt,
      })
      .from(events)
      .where(onde)
      .orderBy(desc(events.startsAt))
      .limit(EVENTOS_POR_PAGINA)
      .offset((Math.max(filtros.pagina, 1) - 1) * EVENTOS_POR_PAGINA),
    db().select({ total: count() }).from(events).where(onde),
  ])

  return { eventos: linhas, total: total?.total ?? 0 }
}

export async function buscarEventoDoAdmin(id: string) {
  const [evento] = await db()
    .select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      descriptionMd: events.descriptionMd,
      coverPath: events.coverPath,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      locationName: events.locationName,
      city: events.city,
      state: events.state,
      externalUrl: events.externalUrl,
      status: events.status,
      searchByCpf: events.searchByCpf,
      searchByEmail: events.searchByEmail,
      searchByName: events.searchByName,
      searchBirthDate: events.searchBirthDate,
      searchMode: events.searchMode,
      contactEmail: events.contactEmail,
      contactUrl: events.contactUrl,
      certificatesReleasedAt: events.certificatesReleasedAt,
    })
    .from(events)
    .where(eq(events.id, id))
  if (!evento) return null

  const [tipos, [emitidos]] = await Promise.all([
    db()
      .select({
        id: participationTypes.id,
        slug: participationTypes.slug,
        label: participationTypes.label,
        aliases: participationTypes.aliases,
        defaultHours: participationTypes.defaultHours,
        certificateTemplateId: participationTypes.certificateTemplateId,
        certificados: count(certificates.id),
      })
      .from(participationTypes)
      .leftJoin(certificates, eq(certificates.participationTypeId, participationTypes.id))
      .where(eq(participationTypes.eventId, id))
      .groupBy(participationTypes.id)
      .orderBy(participationTypes.sortOrder),
    db()
      .select({ total: count() })
      .from(certificates)
      .where(eq(certificates.eventId, id)),
  ])

  return { evento, tipos, certificados: emitidos?.total ?? 0 }
}

export type EventoDoAdmin = NonNullable<Awaited<ReturnType<typeof buscarEventoDoAdmin>>>
