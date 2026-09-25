import { ImageResponse } from 'next/og'

import { CapaGerada } from '@/components/eventos/capa-gerada'
import { buscarEventoPublico, listarSlugsPublicos } from '@/db/queries/events'

/**
 * Capa gerada, 1600 por 900, para evento sem capa enviada (doc 09). Fica em
 * cache como a página do evento, e cai junto com ela pela tag do evento.
 */

export const revalidate = 3600

export async function generateStaticParams() {
  const slugs = await listarSlugsPublicos()
  return slugs.map((slug) => ({ slug }))
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const evento = await buscarEventoPublico(slug)

  if (!evento) {
    return new Response('Evento não encontrado.', { status: 404 })
  }

  return new ImageResponse(<CapaGerada escala={4 / 3} titulo={evento.title} />, {
    width: 1600,
    height: 900,
  })
}
