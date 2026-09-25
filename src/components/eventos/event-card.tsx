import { CalendarDays, MapPin } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import type { EventoDoCatalogo } from '@/db/queries/events'
import { srcDaCapa } from '@/lib/capa'
import { formatarLocal, formatarPeriodo } from '@/lib/format'

import { StatusBadge } from './status-badge'

/**
 * Card de evento do catálogo (doc 03, 6a). Um único link envolve o card todo:
 * o título nomeia o link, por isso a capa tem `alt` vazio.
 */
export function EventCard({ evento }: { evento: EventoDoCatalogo }) {
  const periodo = formatarPeriodo(
    new Date(evento.startsAt),
    evento.endsAt ? new Date(evento.endsAt) : null,
  )

  return (
    <li>
      <Link
        className="bg-card border-border hover:border-primary hover:shadow-glow active:border-primary flex h-full flex-col overflow-hidden rounded-md border transition duration-150 ease-out hover:-translate-y-0.5"
        href={`/eventos/${evento.slug}`}
      >
        <div className="bg-surface relative aspect-video">
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="(min-width: 1536px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            src={srcDaCapa(evento)}
          />
        </div>

        <div className="flex flex-col gap-3 p-5">
          <StatusBadge status={evento.status} />
          <h3 className="text-h3 line-clamp-2 min-h-[2lh] font-semibold">
            {evento.title}
          </h3>
          <p className="text-caption text-muted-foreground flex items-center gap-2">
            <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
            <time dateTime={evento.startsAt}>{periodo}</time>
          </p>
          <p className="text-caption text-muted-foreground flex items-center gap-2">
            <MapPin aria-hidden="true" className="size-4 shrink-0" />
            {formatarLocal(evento)}
          </p>
        </div>
      </Link>
    </li>
  )
}
