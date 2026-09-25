import type { Metadata } from 'next'
import Link from 'next/link'
import { createLoader, createSerializer, type SearchParams } from 'nuqs/server'

import { FiltrosDeEventos } from '@/components/admin/eventos/filtros'
import { parametrosDaLista } from '@/components/admin/eventos/parametros'
import { StatusBadge } from '@/components/eventos/status-badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EVENTOS_POR_PAGINA, listarEventosDoAdmin } from '@/db/queries/admin-events'
import { formatarPeriodo } from '@/lib/format'

export const metadata: Metadata = { title: 'Eventos' }

const carregarParametros = createLoader(parametrosDaLista)
const urlDaLista = createSerializer(parametrosDaLista)

export default async function EventosDoAdminPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const filtros = await carregarParametros(searchParams)
  const { eventos, total } = await listarEventosDoAdmin(filtros)

  const paginas = Math.max(1, Math.ceil(total / EVENTOS_POR_PAGINA))
  const filtrando = Boolean(filtros.status || filtros.busca)

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h2 font-bold">Eventos</h1>
        <Button asChild>
          <Link href="/admin/eventos/novo">Novo evento</Link>
        </Button>
      </header>

      <FiltrosDeEventos />

      {eventos.length === 0 ? (
        <p className="text-muted-foreground">
          {filtrando
            ? 'Nenhum evento com esses filtros.'
            : 'Nenhum evento ainda. Crie o primeiro.'}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventos.map((evento) => (
              <TableRow key={evento.id}>
                <TableCell>
                  <Link
                    className="font-medium hover:underline"
                    href={`/admin/eventos/${evento.id}`}
                  >
                    {evento.title}
                  </Link>
                  <span className="text-muted-foreground block font-mono text-xs">
                    /{evento.slug}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={evento.status} />
                </TableCell>
                <TableCell className="text-caption text-muted-foreground">
                  {formatarPeriodo(evento.startsAt, evento.endsAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {paginas > 1 ? (
        <nav aria-label="Páginas" className="flex items-center justify-between gap-4">
          {filtros.pagina > 1 ? (
            <Link
              className="text-caption hover:underline"
              href={urlDaLista('/admin/eventos', {
                ...filtros,
                pagina: filtros.pagina - 1,
              })}
            >
              Página anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-caption text-muted-foreground">
            Página {filtros.pagina} de {paginas}
          </span>
          {filtros.pagina < paginas ? (
            <Link
              className="text-caption hover:underline"
              href={urlDaLista('/admin/eventos', {
                ...filtros,
                pagina: filtros.pagina + 1,
              })}
            >
              Próxima página
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  )
}
