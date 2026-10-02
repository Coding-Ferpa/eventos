import { ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ApagarEvento } from '@/components/admin/eventos/apagar-evento'
import { BuscaDoEvento } from '@/components/admin/eventos/busca-do-evento'
import { CapaDoEvento } from '@/components/admin/eventos/capa-do-evento'
import { FormularioDeEvento } from '@/components/admin/eventos/formulario-de-evento'
import { StatusDoEvento } from '@/components/admin/eventos/status-do-evento'
import { TiposDeParticipacao } from '@/components/admin/eventos/tipos-de-participacao'
import { ModelosDoEvento } from '@/components/admin/modelos/modelos-do-evento'
import { StatusBadge } from '@/components/eventos/status-badge'
import { Button } from '@/components/ui/button'
import { buscarEventoDoAdmin } from '@/db/queries/admin-events'
import { listarModelosDoEvento } from '@/db/queries/admin-templates'
import { getCurrentUser } from '@/lib/auth'
import { srcDaCapa } from '@/lib/capa'
import { utcParaDataHoraDeSaoPaulo } from '@/lib/format'
import { hasRole } from '@/lib/roles'
import { z } from '@/lib/zod'

type Props = { params: Promise<{ id: string }> }

async function carregar(id: string) {
  // Endereço com id malformado é 404, e não erro de banco.
  if (!z.uuid().safeParse(id).success) return null
  return buscarEventoDoAdmin(id)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dados = await carregar((await params).id)
  return { title: dados?.evento.title ?? 'Evento não encontrado' }
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  const id = `secao-${titulo.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <section
      aria-labelledby={id}
      className="border-border bg-card flex flex-col gap-4 rounded-md border p-5"
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-h3 font-semibold" id={id}>
          {titulo}
        </h2>
        {descricao ? (
          <p className="text-caption text-muted-foreground">{descricao}</p>
        ) : null}
      </header>
      {children}
    </section>
  )
}

export default async function EventoDoAdminPage({ params }: Props) {
  const dados = await carregar((await params).id)
  if (!dados) notFound()

  const { evento, tipos, certificados } = dados
  const [usuario, modelos] = await Promise.all([
    getCurrentUser(),
    listarModelosDoEvento(evento.id),
  ])
  const podeApagar =
    usuario !== null &&
    hasRole(usuario.role, 'admin') &&
    evento.status === 'draft' &&
    certificados === 0

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          className="text-caption text-muted-foreground hover:text-foreground w-fit"
          href="/admin/eventos"
        >
          Voltar para os eventos
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h2 font-bold">{evento.title}</h1>
          <StatusBadge status={evento.status} />
        </div>
        {evento.status === 'draft' ? (
          <p className="text-caption text-muted-foreground">
            Em rascunho: fora do catálogo, e a página pública ainda não existe.
          </p>
        ) : (
          <Link
            className="text-caption text-primary inline-flex w-fit items-center gap-1 hover:underline"
            href={`/eventos/${evento.slug}`}
            target="_blank"
          >
            Ver a página pública
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only">(abre em outra aba)</span>
          </Link>
        )}
      </header>

      <nav aria-label="Participantes do evento" className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={`/admin/eventos/${evento.id}/importar`}>
            Importar participantes
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/admin/eventos/${evento.id}/participantes`}>
            Participantes ({certificados}{' '}
            {certificados === 1 ? 'certificado' : 'certificados'})
          </Link>
        </Button>
      </nav>

      <Secao titulo="Status">
        <StatusDoEvento atual={evento.status} id={evento.id} />
      </Secao>

      <Secao titulo="Dados">
        <FormularioDeEvento
          id={evento.id}
          modo="editar"
          slugTravado={evento.status !== 'draft'}
          valores={{
            title: evento.title,
            slug: evento.slug,
            startsAt: utcParaDataHoraDeSaoPaulo(evento.startsAt),
            endsAt: evento.endsAt ? utcParaDataHoraDeSaoPaulo(evento.endsAt) : '',
            locationName: evento.locationName ?? '',
            city: evento.city ?? '',
            state: evento.state ?? '',
            externalUrl: evento.externalUrl ?? '',
            contactEmail: evento.contactEmail ?? '',
            contactUrl: evento.contactUrl ?? '',
            descriptionMd: evento.descriptionMd,
          }}
        />
      </Secao>

      <Secao titulo="Capa">
        <CapaDoEvento
          id={evento.id}
          src={srcDaCapa(evento)}
          rascunho={evento.status === 'draft'}
          temCapaEnviada={Boolean(evento.coverPath)}
        />
      </Secao>

      <Secao
        descricao="Como cada participante encontra o próprio certificado. Vale quando os certificados entrarem no ar."
        titulo="Busca"
      >
        <BuscaDoEvento
          atual={{
            searchByCpf: evento.searchByCpf,
            searchByEmail: evento.searchByEmail,
            searchByName: evento.searchByName,
            searchBirthDate: evento.searchBirthDate,
            searchMode: evento.searchMode,
          }}
          id={evento.id}
        />
      </Secao>

      <Secao
        descricao="A arte, os campos e a posição de cada texto sobre ela. Cada tipo de participação usa um."
        titulo="Modelos de certificado"
      >
        <ModelosDoEvento eventId={evento.id} modelos={modelos} />
      </Secao>

      <Secao
        descricao="Cada tipo tem a sua carga horária padrão e o seu modelo de certificado."
        titulo="Tipos de participação"
      >
        <TiposDeParticipacao
          eventId={evento.id}
          modelos={modelos.map((modelo) => ({ id: modelo.id, name: modelo.name }))}
          tipos={tipos.map((tipo) => ({
            ...tipo,
            certificados: Number(tipo.certificados),
          }))}
        />
      </Secao>

      {podeApagar ? (
        <Secao
          descricao="Só em rascunho e sem certificados. Depois de publicado, um evento se arquiva."
          titulo="Apagar"
        >
          <ApagarEvento id={evento.id} titulo={evento.title} />
        </Secao>
      ) : null}
    </div>
  )
}
