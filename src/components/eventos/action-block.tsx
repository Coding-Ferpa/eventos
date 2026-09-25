import { ExternalLink } from 'lucide-react'
import Link from 'next/link'

import type { EventoPublico } from '@/db/queries/events'

/**
 * Bloco de ação da página do evento: o que a pessoa pode fazer agora, conforme
 * o status (doc 09). Os textos são a microcopy final do doc 03, seção 7.
 * Rascunho não chega aqui: a página responde 404 antes.
 */
export function ActionBlock({ evento }: { evento: EventoPublico }) {
  return (
    <section
      aria-labelledby="titulo-acao"
      className="bg-card border-border flex flex-col items-start gap-4 rounded-md border p-5"
    >
      <h2 className="sr-only" id="titulo-acao">
        Certificados e inscrições
      </h2>
      <Conteudo evento={evento} />
    </section>
  )
}

function Conteudo({ evento }: { evento: EventoPublico }) {
  switch (evento.status) {
    case 'registration_open':
      return (
        <>
          <p className="text-body">As inscrições estão abertas.</p>
          {evento.externalUrl ? (
            <a
              className="bg-primary-solid text-primary-foreground inline-flex min-h-12 items-center gap-2 rounded-full px-6 font-semibold transition duration-150"
              href={evento.externalUrl}
              rel="noopener"
              target="_blank"
            >
              Quero participar
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only">(abre em outra aba)</span>
            </a>
          ) : null}
        </>
      )

    case 'registration_closed':
      return (
        <p className="text-body">
          As inscrições se encerraram. Depois do evento, os certificados aparecem aqui.
        </p>
      )

    case 'in_progress':
      return (
        <p className="text-body">
          O evento está acontecendo agora. Os certificados saem depois do encerramento.
        </p>
      )

    case 'completed':
      return (
        <p className="text-body">
          Os certificados estão sendo preparados. Assim que saírem, é só voltar aqui e
          buscar o seu.
        </p>
      )

    case 'certificates_available':
      // O formulário de busca entra logo abaixo deste texto no M8 (doc 14).
      return (
        <p className="text-body">Os certificados já estão no ar. Busque o seu abaixo.</p>
      )

    case 'archived':
      return (
        <p className="text-body">
          Este evento foi arquivado. Os certificados emitidos continuam válidos e podem
          ser conferidos em{' '}
          <Link className="text-primary underline" href="/validar">
            Validar certificado
          </Link>
          .
        </p>
      )

    case 'draft':
      return null
  }
}
