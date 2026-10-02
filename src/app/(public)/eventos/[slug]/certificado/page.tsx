import { CircleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { BaixarPdf } from '@/components/certificado/baixar-pdf'
import { CodigoDeValidacao } from '@/components/certificado/codigo-de-validacao'
import { CopiarCodigo } from '@/components/certificado/copiar-codigo'
import { FocoNoTitulo } from '@/components/certificado/foco-no-titulo'
import { PedidoDeCorrecao } from '@/components/certificado/pedido-de-correcao'
import { PreviaComVerso } from '@/components/certificado/previa-com-verso'
import {
  getRetrieval,
  type CertificadoNaRetirada,
  type EventoNaRetirada,
} from '@/db/queries/public-lookup'
import { formatHours } from '@/features/certificate/format'
import { renderCertificateSvg } from '@/features/certificate/preview'
import { semBanco } from '@/lib/ambiente'
import { certificateAssets } from '@/lib/certificate-assets'
import { abrirRetirada, COOKIE_DE_RETIRADA } from '@/lib/cookies/retrieval'
import { serverEnv, siteEnv, supabaseEnv } from '@/lib/env'

/**
 * A tela de retirada (docs 03, 6c, 07 e 09): dinâmica e fora de busca, porque
 * mostra dado de pessoa. Quem autoriza é o cookie cifrado da busca; sem ele,
 * a pessoa volta ao evento com o aviso de sessão expirada.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Seu certificado',
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ erro?: string }>
}

async function previas(
  certificado: CertificadoNaRetirada,
  pessoa: { fullName: string; cpfLast3: string | null },
  evento: EventoNaRetirada,
) {
  const snapshot = certificado.snapshot
  if (!snapshot) return []
  const { fonts } = await certificateAssets.fonts(snapshot)
  const storage = `${supabaseEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/previews`
  const contexto = {
    siteUrl: siteEnv().NEXT_PUBLIC_SITE_URL,
    participant: pessoa,
    event: evento,
    participation: { label: certificado.typeLabel },
    certificate: {
      hours: certificado.hours,
      code: certificado.code,
      issuedAt: certificado.issuedAt,
      sequence: certificado.sequence,
      data: certificado.data,
    },
  }
  return snapshot.pages.map(
    (pagina, i) =>
      renderCertificateSvg({
        snapshot,
        context: contexto,
        fonts,
        page: i + 1,
        backgroundUrl: pagina.preview_path ? `${storage}/${pagina.preview_path}` : null,
        label: `${i === 0 ? 'Prévia' : 'Verso'} do certificado de ${pessoa.fullName}, ${certificado.typeLabel}, no evento ${evento.title}`,
      }).svg,
  )
}

export default async function RetiradaPage({ params, searchParams }: Props) {
  const { slug } = await params
  const voltar = `/eventos/${slug}?sessao=expirada`
  if (semBanco()) redirect(voltar)

  const retirada = abrirRetirada(
    (await cookies()).get(COOKIE_DE_RETIRADA)?.value,
    Buffer.from(serverEnv().RETRIEVAL_COOKIE_KEY, 'base64'),
  )
  if (!retirada) redirect(voltar)
  const dados = await getRetrieval(slug, retirada.pids)
  const pessoa = dados?.people[0]
  if (!dados || !pessoa) redirect(voltar)

  const { event: evento } = dados
  const falhouAGeracao = (await searchParams).erro === 'geracao'
  // Quem chegou pelo nome não ganha 3 dígitos do CPF de ninguém (doc 08).
  const mostraCpf = retirada.src === 'search_cpf' || retirada.src === 'mine'
  const contato = evento.contactEmail ?? evento.contactUrl ?? 'a organização do evento'
  // Ativos primeiro, pela carga horária maior (doc 03, 6c); revogados no fim.
  const cartoes = [...pessoa.certificates].sort(
    (a, b) =>
      Number(b.status === 'active') - Number(a.status === 'active') || b.hours - a.hours,
  )
  const primeiroAtivo = cartoes.find((c) => c.status === 'active')
  const comPrevia = await Promise.all(
    cartoes.map(async (c) => ({
      ...c,
      paginas: c.status === 'active' ? await previas(c, pessoa, evento) : [],
    })),
  )

  return (
    <article className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <Link
        className="text-caption text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center"
        href={`/eventos/${slug}`}
      >
        {evento.title}
      </Link>
      <FocoNoTitulo>
        {cartoes.length === 1
          ? 'Encontramos seu certificado'
          : `Encontramos ${cartoes.length} certificados seus neste evento`}
      </FocoNoTitulo>
      <p className="text-h3 sm:text-h2 font-semibold">{pessoa.fullName}</p>

      {falhouAGeracao ? (
        <p
          className="border-destructive text-destructive flex items-start gap-2 rounded-md border px-4 py-3"
          role="alert"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          Não conseguimos gerar seu PDF agora. O problema é nosso, não seu. Tente de novo
          em instantes.
        </p>
      ) : null}

      <ul className="flex flex-col gap-4">
        {comPrevia.map((certificado) => (
          <li
            className="bg-card border-border grid gap-5 rounded-md border p-5 lg:grid-cols-12"
            key={certificado.code}
          >
            {certificado.paginas.length > 0 ? (
              <div className="lg:col-span-7">
                <PreviaComVerso paginas={certificado.paginas} />
              </div>
            ) : null}
            <div
              className={
                certificado.paginas.length > 0
                  ? 'flex flex-col gap-4 lg:col-span-5'
                  : 'flex flex-col gap-4 lg:col-span-12'
              }
            >
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Evento</dt>
                <dd>{evento.title}</dd>
                <dt className="text-muted-foreground">Participação</dt>
                <dd>{certificado.typeLabel}</dd>
                <dt className="text-muted-foreground">Carga horária</dt>
                <dd>{formatHours(certificado.hours, 'long')}</dd>
                <dt className="text-muted-foreground">Código de validação</dt>
                <dd className="flex flex-col items-start">
                  <CodigoDeValidacao code={certificado.code} />
                  <CopiarCodigo code={certificado.code} />
                </dd>
                {mostraCpf && pessoa.cpfLast3 ? (
                  <>
                    <dt className="text-muted-foreground">CPF</dt>
                    <dd>terminado em {pessoa.cpfLast3}</dd>
                  </>
                ) : null}
              </dl>
              {certificado.status === 'active' ? (
                <BaixarPdf
                  code={certificado.code}
                  destaque={certificado.code === primeiroAtivo?.code}
                />
              ) : (
                <p className="border-warning rounded-md border px-4 py-3" role="status">
                  Este certificado foi revogado pela organização e não pode mais ser
                  baixado. Se achar que é engano, escreva para {contato}.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {primeiroAtivo ? (
        <PedidoDeCorrecao
          code={primeiroAtivo.code}
          nomeAtual={pessoa.fullName}
          pendente={pessoa.correctionPending}
        />
      ) : null}
    </article>
  )
}
