import { ArrowLeft, CalendarDays, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ActionBlock } from '@/components/eventos/action-block'
import { EventMarkdown } from '@/components/eventos/event-markdown'
import { StatusBadge } from '@/components/eventos/status-badge'
import { VisitBeacon } from '@/components/eventos/visit-beacon'
import { buscarEventoPublico, listarSlugsPublicos } from '@/db/queries/events'
import { srcDaCapa } from '@/lib/capa'
import { siteEnv } from '@/lib/env'
import { formatarLocal, formatarPeriodo } from '@/lib/format'
import { OPEN_GRAPH_BASE } from '@/lib/metadata'
import {
  breadcrumbJsonLd,
  credencialJsonLd,
  eventoJsonLd,
  resumoDaDescricao,
  serializarJsonLd,
} from '@/lib/seo'

// ISR (doc 09): cai pela tag `events` ou pela `event:{slug}` quando o admin
// muda o evento. Evento que não estava no build é gerado na primeira visita.
export const revalidate = 3600

type Props = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const slugs = await listarSlugsPublicos()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const evento = await buscarEventoPublico(slug)
  if (!evento) return { title: 'Evento não encontrado' }

  const caminho = `/eventos/${evento.slug}`
  const descricao =
    resumoDaDescricao(evento.descriptionMd) ||
    `Certificados e informações de ${evento.title}.`

  return {
    title: evento.title,
    description: descricao,
    alternates: { canonical: caminho },
    // A imagem vem do `opengraph-image.tsx` ao lado desta página.
    openGraph: {
      ...OPEN_GRAPH_BASE,
      url: caminho,
      title: evento.title,
      description: descricao,
    },
    twitter: { card: 'summary_large_image', title: evento.title, description: descricao },
  }
}

export default async function EventoPage({ params }: Props) {
  const { slug } = await params
  const evento = await buscarEventoPublico(slug)
  if (!evento) notFound()

  const base = siteEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const url = `${base}/eventos/${evento.slug}`
  const capa = srcDaCapa(evento)
  const capaAbsoluta = capa.startsWith('/') ? `${base}${capa}` : capa

  const periodo = formatarPeriodo(
    new Date(evento.startsAt),
    evento.endsAt ? new Date(evento.endsAt) : null,
  )
  const local = [evento.locationName, formatarLocal(evento)].filter(Boolean).join(', ')

  const credencial = credencialJsonLd(evento, url)
  const jsonLd = [
    eventoJsonLd(evento, { url, capa: capaAbsoluta }),
    ...(credencial ? [credencial] : []),
    breadcrumbJsonLd(evento, url, base),
  ]

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <Link
        className="text-caption text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center gap-2"
        href="/"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Todos os eventos
      </Link>

      <div className="bg-surface relative aspect-video overflow-hidden rounded-md">
        <Image
          alt=""
          className="object-cover"
          fill
          priority
          sizes="(min-width: 768px) 48rem, 100vw"
          src={capa}
        />
      </div>

      <header className="flex flex-col gap-3">
        <StatusBadge status={evento.status} />
        <h1 className="text-h2 font-bold">{evento.title}</h1>
        <p className="text-caption text-muted-foreground flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
          <time dateTime={evento.startsAt}>{periodo}</time>
        </p>
        <p className="text-caption text-muted-foreground flex items-center gap-2">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          {local}
        </p>
      </header>

      <ActionBlock evento={evento} />

      {evento.descriptionMd.trim() ? (
        <section aria-labelledby="titulo-sobre" className="flex flex-col gap-4">
          <h2 className="text-h3 font-semibold" id="titulo-sobre">
            Sobre o evento
          </h2>
          <EventMarkdown conteudo={evento.descriptionMd} />
        </section>
      ) : null}

      {jsonLd.map((bloco) => (
        <script
          dangerouslySetInnerHTML={{ __html: serializarJsonLd(bloco) }}
          key={bloco['@type']}
          type="application/ld+json"
        />
      ))}

      <VisitBeacon slug={evento.slug} />
    </article>
  )
}
