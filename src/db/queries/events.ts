import 'server-only'

import { and, desc, eq, ne, notInArray } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

import { queryAsAnon } from '@/db/client'
import { events } from '@/db/schema'
import { semBanco } from '@/lib/ambiente'

/**
 * Leituras da área pública (doc 09). Todas passam por `queryAsAnon`, para que a
 * RLS valha de fato: rascunho não sai daqui nem se um filtro for esquecido.
 *
 * Sem banco, fora da produção (ADR-0014), cada uma devolve o que devolveria sem
 * nenhum evento, antes de abrir conexão: é o que permite à Preview e ao build
 * do CI renderizarem o site vazio.
 *
 * As datas saem como texto ISO, e não como `Date`: o cache do Next guarda o
 * resultado em JSON, e um `Date` voltaria do cache como texto de qualquer
 * jeito, com o tipo mentindo.
 */

export type EventStatus = (typeof events.$inferSelect)['status']

export type EventoDoCatalogo = {
  slug: string
  title: string
  status: EventStatus
  startsAt: string
  endsAt: string | null
  city: string | null
  state: string | null
  coverPath: string | null
}

export type EventoPublico = EventoDoCatalogo & {
  descriptionMd: string
  locationName: string | null
  externalUrl: string | null
  updatedAt: string
}

const UMA_HORA = 3600

const colunasDoCatalogo = {
  slug: events.slug,
  title: events.title,
  status: events.status,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  city: events.city,
  state: events.state,
  coverPath: events.coverPath,
}

function paraCatalogo(linha: {
  slug: string
  title: string
  status: EventStatus
  startsAt: Date
  endsAt: Date | null
  city: string | null
  state: string | null
  coverPath: string | null
}): EventoDoCatalogo {
  return {
    ...linha,
    startsAt: linha.startsAt.toISOString(),
    endsAt: linha.endsAt?.toISOString() ?? null,
  }
}

/** Catálogo: fora de rascunho e de arquivado, mais recentes primeiro. */
export const listarCatalogo = unstable_cache(
  async (): Promise<EventoDoCatalogo[]> => {
    if (semBanco()) return []

    const linhas = await queryAsAnon((tx) =>
      tx
        .select(colunasDoCatalogo)
        .from(events)
        .where(notInArray(events.status, ['draft', 'archived']))
        .orderBy(desc(events.startsAt)),
    )
    return linhas.map(paraCatalogo)
  },
  ['catalogo'],
  { revalidate: UMA_HORA, tags: ['events'] },
)

/** Página do evento: qualquer status menos rascunho, que é 404 (doc 09). */
export async function buscarEventoPublico(slug: string): Promise<EventoPublico | null> {
  const buscar = unstable_cache(
    async (): Promise<EventoPublico | null> => {
      if (semBanco()) return null

      const [linha] = await queryAsAnon((tx) =>
        tx
          .select({
            ...colunasDoCatalogo,
            descriptionMd: events.descriptionMd,
            locationName: events.locationName,
            externalUrl: events.externalUrl,
            updatedAt: events.updatedAt,
          })
          .from(events)
          .where(and(eq(events.slug, slug), ne(events.status, 'draft')))
          .limit(1),
      )
      if (!linha) return null

      return {
        ...paraCatalogo(linha),
        descriptionMd: linha.descriptionMd,
        locationName: linha.locationName,
        externalUrl: linha.externalUrl,
        updatedAt: linha.updatedAt.toISOString(),
      }
    },
    ['evento-publico', slug],
    { revalidate: UMA_HORA, tags: ['events', `event:${slug}`] },
  )

  return buscar()
}

export type EventoDoSitemap = { slug: string; updatedAt: string }

/**
 * Eventos que o sitemap lista: os mesmos do catálogo. O arquivado continua no
 * ar para quem tem o link, mas não é mais oferecido a buscador (doc 09).
 */
export const listarEventosDoSitemap = unstable_cache(
  async (): Promise<EventoDoSitemap[]> => {
    if (semBanco()) return []

    const linhas = await queryAsAnon((tx) =>
      tx
        .select({ slug: events.slug, updatedAt: events.updatedAt })
        .from(events)
        .where(notInArray(events.status, ['draft', 'archived'])),
    )
    return linhas.map((linha) => ({
      slug: linha.slug,
      updatedAt: linha.updatedAt.toISOString(),
    }))
  },
  ['sitemap'],
  { revalidate: UMA_HORA, tags: ['events'] },
)

/** Slugs pré-renderizados no build: todo evento que tem página pública. */
export async function listarSlugsPublicos(): Promise<string[]> {
  if (semBanco()) return []

  const linhas = await queryAsAnon((tx) =>
    tx.select({ slug: events.slug }).from(events).where(ne(events.status, 'draft')),
  )
  return linhas.map((linha) => linha.slug)
}
