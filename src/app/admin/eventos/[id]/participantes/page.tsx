import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createLoader, createSerializer, type SearchParams } from 'nuqs/server'

import { FiltrosDeParticipantes } from '@/components/admin/participantes/filtros'
import { ListaDeCertificados } from '@/components/admin/participantes/lista'
import { NovoParticipante } from '@/components/admin/participantes/novo-participante'
import { parametrosDosParticipantes } from '@/components/admin/participantes/parametros'
import { Button } from '@/components/ui/button'
import { buscarEventoDoAdmin } from '@/db/queries/admin-events'
import {
  CERTIFICADOS_POR_PAGINA,
  listarCertificadosDoEvento,
  listarLotesAplicados,
} from '@/db/queries/admin-participants'
import { getCurrentUser } from '@/lib/auth'
import { hasRole } from '@/lib/roles'
import { z } from '@/lib/zod'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }

const carregarParametros = createLoader(parametrosDosParticipantes)

async function carregarEvento(id: string) {
  if (!z.uuid().safeParse(id).success) return null
  return buscarEventoDoAdmin(id)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dados = await carregarEvento((await params).id)
  return {
    title: dados ? `Participantes: ${dados.evento.title}` : 'Evento não encontrado',
  }
}

export default async function ParticipantesPage({ params, searchParams }: Props) {
  const dados = await carregarEvento((await params).id)
  if (!dados) notFound()
  const { evento, tipos } = dados

  const filtros = await carregarParametros(searchParams)
  const lote =
    filtros.lote && z.uuid().safeParse(filtros.lote).success ? filtros.lote : null
  const [{ linhas, total }, lotes, usuario] = await Promise.all([
    listarCertificadosDoEvento(evento.id, { ...filtros, lote }),
    listarLotesAplicados(evento.id),
    getCurrentUser(),
  ])
  const paginas = Math.max(1, Math.ceil(total / CERTIFICADOS_POR_PAGINA))
  const urlDaPagina = createSerializer(parametrosDosParticipantes)
  const liberado = evento.certificatesReleasedAt !== null

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          className="text-caption text-muted-foreground hover:text-foreground w-fit"
          href={`/admin/eventos/${evento.id}`}
        >
          Voltar para o evento
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-h2 font-bold">Participantes</h1>
            <p className="text-muted-foreground">{evento.title}</p>
          </div>
          <Button asChild>
            <Link href={`/admin/eventos/${evento.id}/importar`}>
              Importar participantes
            </Link>
          </Button>
        </div>
      </header>

      <NovoParticipante
        eventId={evento.id}
        tipos={tipos
          .filter((tipo) => tipo.certificateTemplateId !== null)
          .map((tipo) => ({ id: tipo.id, label: tipo.label }))}
      />

      <FiltrosDeParticipantes
        lotes={lotes.map((l) => ({
          id: l.id,
          rotulo: `${l.fileName ?? 'Arquivo'}, aplicado em ${l.appliedAt?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`,
        }))}
      />

      <ListaDeCertificados
        eventId={evento.id}
        liberado={liberado}
        linhas={linhas.map((linha) => ({
          ...linha,
          hours: Number(linha.hours),
          baixado: linha.baixado !== null,
        }))}
        podeRemoverDepoisDaLiberacao={usuario !== null && hasRole(usuario.role, 'admin')}
        total={total}
      />

      {paginas > 1 ? (
        <nav aria-label="Páginas" className="flex flex-wrap items-center gap-3">
          {filtros.pagina > 1 ? (
            <Button asChild variant="outline">
              <Link
                href={urlDaPagina(`/admin/eventos/${evento.id}/participantes`, {
                  ...filtros,
                  pagina: filtros.pagina - 1,
                })}
              >
                Anterior
              </Link>
            </Button>
          ) : null}
          <span className="text-caption text-muted-foreground">
            Página {filtros.pagina} de {paginas}
          </span>
          {filtros.pagina < paginas ? (
            <Button asChild variant="outline">
              <Link
                href={urlDaPagina(`/admin/eventos/${evento.id}/participantes`, {
                  ...filtros,
                  pagina: filtros.pagina + 1,
                })}
              >
                Próxima
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}
