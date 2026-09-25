import type { EventStatus } from '@/db/queries/events'
import { cn } from '@/lib/cn'

/**
 * Selo de status do evento (doc 03, 6a). A cor vai no ponto, e não no texto:
 * texto semântico sobre `surface` reprova no tema claro, e o ponto só precisa
 * de 3:1. O rótulo em texto garante que a cor nunca é o único sinal.
 */

const ROTULO: Record<EventStatus, string> = {
  draft: 'Rascunho',
  registration_open: 'Inscrições abertas',
  registration_closed: 'Inscrições encerradas',
  in_progress: 'Acontecendo agora',
  completed: 'Certificados em preparo',
  certificates_available: 'Certificados disponíveis',
  archived: 'Arquivado',
}

const COR_DO_PONTO: Record<EventStatus, string> = {
  draft: 'bg-muted-foreground',
  registration_open: 'bg-success',
  registration_closed: 'bg-warning',
  in_progress: 'bg-primary motion-safe:animate-pulse',
  completed: 'bg-muted-foreground',
  certificates_available: '',
  archived: 'bg-subtle-foreground',
}

export function rotuloDoStatus(status: EventStatus): string {
  return ROTULO[status]
}

export function StatusBadge({ status }: { status: EventStatus }) {
  // O único status que libera ação ganha o selo sólido, sem ponto.
  if (status === 'certificates_available') {
    return (
      <span className="bg-primary-solid text-caption text-primary-foreground inline-flex w-fit items-center rounded-full px-3 py-1 font-medium">
        {ROTULO[status]}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'bg-surface text-foreground text-caption inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 font-medium',
        status === 'draft' &&
          'border-muted-foreground border border-dashed bg-transparent',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 rounded-full', COR_DO_PONTO[status])}
      />
      {ROTULO[status]}
    </span>
  )
}
