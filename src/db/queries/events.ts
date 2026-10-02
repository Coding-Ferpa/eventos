import 'server-only'

import { and, desc, eq, ne, notInArray } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'

import { queryAsAnon } from '@/db/client'
import { events } from '@/db/schema'
import { semBanco } from '@/lib/ambiente'
import type { ConfiguracaoDaBusca } from '@/lib/busca'

/**
 * Leituras da área pública (doc 09). Todas passam por `queryAsAnon`, para que a
 * RLS valha de fato: rascunho não sai daqui nem se um filtro for esquecido.
 *
 * Sem banco, fora da produção (ADR-0014), cada uma devolve o que devolveria sem
 * nenhum evento: é o que permite à Preview e ao build do CI renderizarem o
 * site vazio. A pergunta vem antes do cache de dados, e não dentro dele: o
 * `.next/cache` sobrevive entre builds, na máquina e no cache de build da
 * Vercel, e um build sem banco não pode servir o que um build com banco
 * guardou lá.
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
  /** Quais campos o formulário de busca mostra (doc 03, 6b). */
  search: ConfiguracaoDaBusca
  contactEmail: string | null
  contactUrl: string | null
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

const catalogoEmCache = unstable_cache(
  async (): Promise<EventoDoCatalogo[]> => {
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

/** Catálogo: fora de rascunho e de arquivado, mais recentes primeiro. */
export async function listarCatalogo(): Promise<EventoDoCatalogo[]> {
  return semBanco() ? [] : catalogoEmCache()
}

/** Página do evento: qualquer status menos rascunho, que é 404 (doc 09). */
export async function buscarEventoPublico(slug: string): Promise<EventoPublico | null> {
  if (semBanco()) return null

  const buscar = unstable_cache(
    async (): Promise<EventoPublico | null> => {
      const [linha] = await queryAsAnon((tx) =>
        tx
          .select({
            ...colunasDoCatalogo,
            descriptionMd: events.descriptionMd,
            locationName: events.locationName,
            externalUrl: events.externalUrl,
            updatedAt: events.updatedAt,
            searchMode: events.searchMode,
            searchByCpf: events.searchByCpf,
            searchByEmail: events.searchByEmail,
            searchByName: events.searchByName,
            searchBirthDate: events.searchBirthDate,
            contactEmail: events.contactEmail,
            contactUrl: events.contactUrl,
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
        search: {
          mode: linha.searchMode,
          byCpf: linha.searchByCpf,
          byEmail: linha.searchByEmail,
          byName: linha.searchByName,
          birthDateRequired: linha.searchBirthDate,
        },
        contactEmail: linha.contactEmail,
        contactUrl: linha.contactUrl,
      }
    },
    ['evento-publico', slug],
    { revalidate: UMA_HORA, tags: ['events', `event:${slug}`] },
  )

  return buscar()
}

export type EventoDoSitemap = { slug: string; updatedAt: string }

const sitemapEmCache = unstable_cache(
  async (): Promise<EventoDoSitemap[]> => {
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

/**
 * Eventos que o sitemap lista: os mesmos do catálogo. O arquivado continua no
 * ar para quem tem o link, mas não é mais oferecido a buscador (doc 09).
 */
export async function listarEventosDoSitemap(): Promise<EventoDoSitemap[]> {
  return semBanco() ? [] : sitemapEmCache()
}

/** Slugs pré-renderizados no build: todo evento que tem página pública. */
export async function listarSlugsPublicos(): Promise<string[]> {
  if (semBanco()) return []

  const linhas = await queryAsAnon((tx) =>
    tx.select({ slug: events.slug }).from(events).where(ne(events.status, 'draft')),
  )
  return linhas.map((linha) => linha.slug)
}
