'use client'

import Link from 'next/link'

import type { ImportSummary } from '@/actions/imports'
import { Button } from '@/components/ui/button'

/** Quarto passo: o que entrou, e para onde ir. */
export function PassoConcluido({
  eventId,
  summary,
  aoImportarOutra,
}: {
  eventId: string
  summary: ImportSummary
  aoImportarOutra: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <p role="status">
        {summary.create}{' '}
        {summary.create === 1 ? 'certificado criado' : 'certificados criados'} e{' '}
        {summary.update} {summary.update === 1 ? 'atualizado' : 'atualizados'}
        {summary.new_people > 0
          ? `, com ${summary.new_people} ${summary.new_people === 1 ? 'pessoa nova' : 'pessoas novas'}`
          : ''}
        .
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={`/admin/eventos/${eventId}/participantes`}>
            Ver os participantes
          </Link>
        </Button>
        <Button onClick={aoImportarOutra} type="button" variant="outline">
          Importar outra lista
        </Button>
      </div>
    </div>
  )
}
