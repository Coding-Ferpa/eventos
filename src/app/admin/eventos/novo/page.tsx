import type { Metadata } from 'next'
import Link from 'next/link'

import { FormularioDeEvento } from '@/components/admin/eventos/formulario-de-evento'

export const metadata: Metadata = { title: 'Novo evento' }

export default function NovoEventoPage() {
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          className="text-caption text-muted-foreground hover:text-foreground"
          href="/admin/eventos"
        >
          Voltar para os eventos
        </Link>
        <h1 className="text-h2 font-bold">Novo evento</h1>
        <p className="text-muted-foreground">
          O evento nasce em rascunho, fora do catálogo, com os tipos participante,
          palestrante, organizador e monitor.
        </p>
      </header>

      <FormularioDeEvento modo="novo" />
    </section>
  )
}
