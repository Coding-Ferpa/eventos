import type { Metadata } from 'next'
import Link from 'next/link'

import { EventCard } from '@/components/eventos/event-card'
import { listarCatalogo } from '@/db/queries/events'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// ISR de uma hora (doc 09). Publicar ou mudar um evento no admin derruba o
// cache na hora, pela tag `events`.
export const revalidate = 3600

export default async function HomePage() {
  const eventos = await listarCatalogo()

  return (
    // O container fica na página, e não no `<main>` do layout: telas de tarefa
    // única (busca, retirada, validação) usam largura menor (doc 03).
    <div className="mx-auto w-full max-w-[var(--container-max)] px-6">
      <section className="py-16 sm:py-24">
        <h1 className="text-display font-bold">
          Seu certificado, <span className="text-primary">na hora.</span>
        </h1>
        <p className="text-body text-muted-foreground mt-6 max-w-2xl">
          Ache o evento, confirme seus dados e baixe o PDF. Sem cadastro.
        </p>
        <Link
          className="border-border hover:border-primary-muted mt-8 inline-flex min-h-12 items-center rounded-full border px-6 font-semibold transition duration-150"
          href="/validar"
        >
          Validar um certificado
        </Link>
      </section>

      <section aria-labelledby="titulo-eventos" className="pb-8">
        <h2 className="text-h2 mb-8 font-bold" id="titulo-eventos">
          Eventos
        </h2>

        {eventos.length === 0 ? (
          <p className="text-body text-muted-foreground max-w-2xl">
            Nenhum evento por aqui... ainda. Quando a comunidade marcar o próximo, ele
            aparece nesta página.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {eventos.map((evento, indice) => (
              <EventCard evento={evento} key={evento.slug} primeiro={indice === 0} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
