import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AssistenteDeImportacao } from '@/components/admin/importacao/assistente'
import { buscarEventoDoAdmin } from '@/db/queries/admin-events'
import { z } from '@/lib/zod'

type Props = { params: Promise<{ id: string }> }

async function carregar(id: string) {
  if (!z.uuid().safeParse(id).success) return null
  return buscarEventoDoAdmin(id)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dados = await carregar((await params).id)
  return {
    title: dados
      ? `Importar participantes: ${dados.evento.title}`
      : 'Evento não encontrado',
  }
}

export default async function ImportarPage({ params }: Props) {
  const dados = await carregar((await params).id)
  if (!dados) notFound()
  const { evento, tipos } = dados

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          className="text-caption text-muted-foreground hover:text-foreground w-fit"
          href={`/admin/eventos/${evento.id}`}
        >
          Voltar para o evento
        </Link>
        <h1 className="text-h2 font-bold">Importar participantes</h1>
        <p className="text-muted-foreground">{evento.title}</p>
      </header>

      <AssistenteDeImportacao
        buscaPorCpf={evento.searchByCpf}
        eventId={evento.id}
        tipos={tipos.map((tipo) => ({
          id: tipo.id,
          label: tipo.label,
          temModelo: tipo.certificateTemplateId !== null,
        }))}
      />
    </div>
  )
}
