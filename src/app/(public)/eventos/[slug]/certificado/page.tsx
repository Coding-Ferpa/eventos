import { CircleAlert, Download } from 'lucide-react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { CodigoDeValidacao } from '@/components/certificado/codigo-de-validacao'
import { PedidoDeCorrecao } from '@/components/certificado/pedido-de-correcao'
import {
  getRetrieval,
  type CertificadoNaRetirada,
  type EventoNaRetirada,
} from '@/db/queries/public-lookup'
import { formatCpfMasked, formatHours } from '@/features/certificate/format'
import { renderCertificateSvg } from '@/features/certificate/preview'
import { semBanco } from '@/lib/ambiente'
import { certificateAssets } from '@/lib/certificate-assets'
import { abrirRetirada, COOKIE_DE_RETIRADA } from '@/lib/cookies/retrieval'
import { serverEnv, siteEnv, supabaseEnv } from '@/lib/env'

/**
 * A tela de retirada (docs 07 e 09): dinâmica e fora de busca, porque mostra
 * dado de pessoa. Quem autoriza é o cookie cifrado da busca; sem ele, a pessoa
 * volta ao evento com o aviso de sessão expirada.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Seus certificados',
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ erro?: string }>
}

async function previa(
  certificado: CertificadoNaRetirada,
  nome: string,
  cpfLast3: string | null,
  evento: EventoNaRetirada,
) {
  if (!certificado.snapshot) return null
  const { fonts } = await certificateAssets.fonts(certificado.snapshot)
  const fundo = certificado.snapshot.pages[0]?.preview_path
  const storage = `${supabaseEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/previews`
  return renderCertificateSvg({
    snapshot: certificado.snapshot,
    context: {
      siteUrl: siteEnv().NEXT_PUBLIC_SITE_URL,
      participant: { fullName: nome, cpfLast3 },
      event: evento,
      participation: { label: certificado.typeLabel },
      certificate: {
        hours: certificado.hours,
        code: certificado.code,
        issuedAt: certificado.issuedAt,
        sequence: certificado.sequence,
        data: certificado.data,
      },
    },
    fonts,
    page: 1,
    backgroundUrl: fundo ? `${storage}/${fundo}` : null,
  }).svg
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
  if (!dados || dados.people.length === 0) redirect(voltar)

  const { event: evento, people } = dados
  const falhouAGeracao = (await searchParams).erro === 'geracao'
  // Quem chegou pelo nome não ganha 3 dígitos do CPF de ninguém (doc 08).
  const mostraCpf = retirada.src === 'search_cpf' || retirada.src === 'mine'
  const contato = evento.contactEmail ?? evento.contactUrl ?? 'a organização do evento'

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <Link
        className="text-caption text-muted-foreground hover:text-foreground inline-flex min-h-11 w-fit items-center"
        href={`/eventos/${slug}`}
      >
        {evento.title}
      </Link>
      <h1 className="text-h2 font-bold">Seus certificados</h1>

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

      {await Promise.all(
        people.map(async (pessoa) => (
          <section
            aria-label={pessoa.fullName}
            className="flex flex-col gap-6"
            key={pessoa.fullName}
          >
            {mostraCpf && pessoa.cpfLast3 ? (
              <p className="text-caption text-muted-foreground">
                CPF {formatCpfMasked(pessoa.cpfLast3)}
              </p>
            ) : null}
            {await Promise.all(
              pessoa.certificates.map(async (certificado) => {
                const svg =
                  certificado.status === 'active'
                    ? await previa(certificado, pessoa.fullName, pessoa.cpfLast3, evento)
                    : null
                return (
                  <div
                    className="bg-card border-border flex flex-col gap-4 rounded-md border p-5"
                    key={certificado.code}
                  >
                    {svg ? (
                      <div
                        className="overflow-hidden rounded-sm border"
                        // O SVG sai do nosso desenhista, com o texto em contornos de
                        // glifo e os atributos escapados.
                        dangerouslySetInnerHTML={{ __html: svg }}
                      />
                    ) : null}
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                      <dt className="text-muted-foreground">Nome</dt>
                      <dd className="font-medium">{pessoa.fullName}</dd>
                      <dt className="text-muted-foreground">Participação</dt>
                      <dd>{certificado.typeLabel}</dd>
                      <dt className="text-muted-foreground">Carga horária</dt>
                      <dd>{formatHours(certificado.hours, 'long')}</dd>
                      <dt className="text-muted-foreground">Código</dt>
                      <dd>
                        <CodigoDeValidacao code={certificado.code} />
                      </dd>
                    </dl>
                    {certificado.status === 'active' ? (
                      <div className="flex flex-col gap-3">
                        {/* Link comum, sem `download`: o Content-Disposition baixa no
                            sucesso, e a falha navega para esta tela com o aviso. */}
                        <a
                          className="bg-primary-solid text-primary-foreground inline-flex min-h-12 w-fit items-center gap-2 rounded-full px-6 font-semibold"
                          href={`/api/certificados/${certificado.code}/pdf`}
                        >
                          <Download aria-hidden="true" className="size-4" />
                          Baixar o PDF
                        </a>
                        <PedidoDeCorrecao
                          code={certificado.code}
                          nomeAtual={pessoa.fullName}
                        />
                      </div>
                    ) : (
                      <p
                        className="border-warning rounded-md border px-4 py-3"
                        role="status"
                      >
                        Este certificado foi revogado pela organização e não pode mais ser
                        baixado. Se achar que é engano, escreva para {contato}.
                      </p>
                    )}
                  </div>
                )
              }),
            )}
          </section>
        )),
      )}
    </article>
  )
}
