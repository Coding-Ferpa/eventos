import { notFound } from 'next/navigation'
import { ImageResponse } from 'next/og'

import { CapaGerada } from '@/components/eventos/capa-gerada'
import { buscarEventoPublico, listarSlugsPublicos } from '@/db/queries/events'
import { formatarPeriodo } from '@/lib/format'

/**
 * Cartão de compartilhamento, 1200 por 630 (doc 09): título, data e a
 * identidade da comunidade. É o que aparece quando o link cai no WhatsApp.
 */

export const alt = 'Cartão do evento, com o título e a data'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 3600

// Pré-gerado no build, como a capa: sem isto, cada robô de pré-visualização
// que abrisse o link pagaria uma renderização de imagem.
export async function generateStaticParams() {
  const slugs = await listarSlugsPublicos()
  return slugs.map((slug) => ({ slug }))
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const evento = await buscarEventoPublico(slug)
  if (!evento) notFound()

  const periodo = formatarPeriodo(
    new Date(evento.startsAt),
    evento.endsAt ? new Date(evento.endsAt) : null,
  )

  return new ImageResponse(
    <CapaGerada detalhe={periodo} escala={1} titulo={evento.title} />,
    size,
  )
}
