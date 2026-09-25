import type { MetadataRoute } from 'next'

import { listarEventosDoSitemap } from '@/db/queries/events'
import { siteEnv } from '@/lib/env'

/** Uma hora: evento publicado não precisa estar no sitemap no mesmo minuto. */
export const revalidate = 3600

/**
 * As páginas fixas e os eventos fora de rascunho e de arquivado (doc 09). O
 * arquivado continua no ar para quem tem o link, mas não é mais oferecido a
 * buscador. Validação e retirada ficam de fora: têm nome de pessoa.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const eventos = await listarEventosDoSitemap()

  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/validar`, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${base}/privacidade`, changeFrequency: 'yearly', priority: 0.2 },
    ...eventos.map((evento) => ({
      url: `${base}/eventos/${evento.slug}`,
      lastModified: new Date(evento.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
