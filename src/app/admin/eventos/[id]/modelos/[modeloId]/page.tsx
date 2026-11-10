import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BUCKETS } from '@/lib/buckets'
import { EditorDeModelo } from '@/components/admin/modelos/editor-de-modelo'
import { Badge } from '@/components/ui/badge'
import { buscarModeloParaEditor } from '@/db/queries/admin-templates'
import { formatDateLong } from '@/features/certificate/format'
import { siteEnv, supabaseEnv } from '@/lib/env'
import { z } from '@/lib/zod'

// O attachArt baixa a arte e gera o base.pdf nesta rota (doc 07).
export const maxDuration = 60

type Props = { params: Promise<{ id: string; modeloId: string }> }

async function carregar({ id, modeloId }: { id: string; modeloId: string }) {
  // Endereço com id malformado é 404, e não erro de banco.
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(modeloId).success)
    return null
  const dados = await buscarModeloParaEditor(modeloId)
  // Modelo de outro evento pelo endereço deste: não existe aqui.
  return dados && dados.evento.id === id ? dados : null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dados = await carregar(await params)
  return { title: dados ? `Modelo ${dados.modelo.name}` : 'Modelo não encontrado' }
}

export default async function EditorDeModeloPage({ params }: Props) {
  const dados = await carregar(await params)
  if (!dados) notFound()
  const { modelo, evento, tipos, fontesEnviadas } = dados

  const storage = `${supabaseEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${BUCKETS.previas}`
  const tipo = tipos[0] ?? null

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          className="text-caption text-muted-foreground hover:text-foreground w-fit"
          href={`/admin/eventos/${evento.id}`}
        >
          Voltar para {evento.title}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h2 font-bold">{modelo.name}</h1>
          {modelo.status === 'published' ? (
            <Badge variant="secondary">Publicado, versão {modelo.version}</Badge>
          ) : (
            <Badge variant="outline">Rascunho</Badge>
          )}
        </div>
        <p className="text-caption text-muted-foreground">
          {modelo.publishedAt
            ? `Publicado em ${formatDateLong(modelo.publishedAt)}. Mudanças no rascunho só chegam aos PDFs ao publicar de novo.`
            : 'Ainda não publicado: nenhum certificado sai com este modelo.'}{' '}
          {tipos.length > 0
            ? `Usado por: ${tipos.map((t) => t.label).join(', ')}.`
            : 'Nenhum tipo de participação usa este modelo ainda; escolha na página do evento.'}
        </p>
      </header>

      <EditorDeModelo
        evento={{
          title: evento.title,
          locationName: evento.locationName,
          city: evento.city,
          startsAt: evento.startsAt.toISOString(),
          endsAt: evento.endsAt?.toISOString() ?? null,
        }}
        fontesEnviadas={fontesEnviadas}
        fundos={modelo.pages.map((pagina) =>
          pagina.preview_path ? `${storage}/${pagina.preview_path}` : null,
        )}
        paginas={modelo.pages}
        rascunho={{ data_fields: modelo.dataFields, layout_fields: modelo.layoutFields }}
        siteUrl={siteEnv().NEXT_PUBLIC_SITE_URL}
        templateId={modelo.id}
        tipo={tipo ? { label: tipo.label, defaultHours: tipo.defaultHours } : null}
      />
    </div>
  )
}
