import { CircleAlert, CircleCheck, CircleSlash, SearchX } from 'lucide-react'
import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import { headers } from 'next/headers'
import Link from 'next/link'
import { permanentRedirect } from 'next/navigation'
import { cache } from 'react'

import { CodigoDeValidacao } from '@/components/certificado/codigo-de-validacao'
import { CodeInput } from '@/components/validacao/code-input'
import { db } from '@/db/client'
import { validateCertificate, type ValidacaoPublica } from '@/db/queries/public-lookup'
import { canonicalizeCode, isValidCode } from '@/features/certificate/code'
import { formatDateLong, formatHours } from '@/features/certificate/format'
import { semBanco } from '@/lib/ambiente'
import { serverEnv } from '@/lib/env'
import { textoDaContagem } from '@/lib/espera'
import { formatarPeriodo } from '@/lib/format'
import { hashDiario } from '@/lib/hmac'
import { consumirBalde, LIMITES } from '@/lib/rate-limit'

/**
 * `/validar/{codigo}` (docs 03, 6e, e 07): dinâmica e nunca em cache. A
 * revogação aparece na hora, o rate limit funciona, e o smoke diário toca o
 * Postgres. Exibe nome de pessoa: `noindex`.
 */

export const dynamic = 'force-dynamic'

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: '400',
  display: 'optional',
})

type Props = { params: Promise<{ codigo: string }> }

type Consulta =
  | { estado: 'canonica'; code: string }
  | { estado: 'malformed' }
  | { estado: 'limite'; esperar: number }
  | { estado: 'resultado'; code: string; resultado: ValidacaoPublica }

// Uma consulta por requisição, para a metadata e a página: o rate limit e o
// registro em validation_checks acontecem uma vez só.
const consultar = cache(async (codigo: string): Promise<Consulta> => {
  const bruto = decodeURIComponent(codigo)
  const canonico = canonicalizeCode(bruto)
  // Malformado não consulta o banco (doc 03).
  if (!isValidCode(canonico)) return { estado: 'malformed' }
  if (canonico !== bruto) return { estado: 'canonica', code: canonico }
  if (semBanco())
    return { estado: 'resultado', code: canonico, resultado: { outcome: 'not_found' } }

  const ip =
    (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
  const ipHash = hashDiario(serverEnv().IP_HASH_SECRET, ip)
  const veredito = await consumirBalde(
    db(),
    `validation:ip:${ipHash}`,
    LIMITES.validacaoPorIp,
  )
  if (!veredito.permitido) return { estado: 'limite', esperar: veredito.esperarSegundos }

  const resultado = await validateCertificate(canonico, ipHash)
  return { estado: 'resultado', code: canonico, resultado }
})

const TITULOS = {
  valid: 'Certificado válido',
  revoked: 'Certificado revogado',
  erased: 'Certificado removido a pedido do titular',
  not_found: 'Não encontramos esse código',
  malformed: 'Esse código não tem o formato certo',
  limite: 'Muitas consultas seguidas',
  canonica: 'Validar certificado',
} as const

type EstadoVisual = Exclude<keyof typeof TITULOS, 'canonica'>

function estadoDe(consulta: Consulta): EstadoVisual | 'canonica' {
  return consulta.estado === 'resultado' ? consulta.resultado.outcome : consulta.estado
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const consulta = await consultar((await params).codigo)
  return { title: TITULOS[estadoDe(consulta)], robots: { index: false, follow: false } }
}

const TOM = {
  valid: {
    borda: 'border-l-success shadow-glow',
    texto: 'text-success',
    Icone: CircleCheck,
  },
  revoked: {
    borda: 'border-l-destructive',
    texto: 'text-destructive',
    Icone: CircleSlash,
  },
  erased: {
    borda: 'border-l-muted-foreground',
    texto: 'text-muted-foreground',
    Icone: CircleSlash,
  },
  not_found: { borda: 'border-l-warning', texto: 'text-warning', Icone: SearchX },
  malformed: { borda: 'border-l-warning', texto: 'text-warning', Icone: CircleAlert },
  limite: { borda: 'border-l-warning', texto: 'text-warning', Icone: CircleAlert },
} as const

const DICA = 'Confira a digitação: são 10 caracteres, sem as letras I, L, O e U.'

export default async function ValidacaoPage({ params }: Props) {
  const { codigo } = await params
  const consulta = await consultar(codigo)
  if (consulta.estado === 'canonica') permanentRedirect(`/validar/${consulta.code}`)

  const estado = estadoDe(consulta) as EstadoVisual
  const r = consulta.estado === 'resultado' ? consulta.resultado : null
  const tom = TOM[estado]
  const tentarDeNovo = estado === 'not_found' || estado === 'malformed'

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">
      <section
        aria-labelledby="titulo-da-validacao"
        className={`bg-card border-border flex flex-col gap-4 rounded-md border border-l-4 p-5 ${tom.borda}`}
      >
        {'code' in consulta ? (
          <CodigoDeValidacao className={jetBrainsMono.className} code={consulta.code} />
        ) : null}
        <div className={`flex items-center gap-3 ${tom.texto}`}>
          <tom.Icone aria-hidden="true" className="size-8 shrink-0" />
          <h1 className="text-h3 font-semibold" id="titulo-da-validacao">
            {TITULOS[estado]}
          </h1>
        </div>

        {r && (r.outcome === 'valid' || r.outcome === 'revoked') ? (
          <>
            {r.outcome === 'revoked' ? (
              <p>
                Revogado em {formatDateLong(r.revokedAt)}. Este documento não vale como
                comprovante.
              </p>
            ) : null}
            <dl
              className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 ${r.outcome === 'revoked' ? 'text-muted-foreground' : ''}`}
            >
              <dt className="text-muted-foreground">Nome</dt>
              <dd className="font-medium">{r.fullName}</dd>
              <dt className="text-muted-foreground">Evento</dt>
              <dd>
                <Link
                  className="underline-offset-4 hover:underline"
                  href={`/eventos/${r.eventSlug}`}
                >
                  {r.eventTitle}
                </Link>
              </dd>
              <dt className="text-muted-foreground">Participação</dt>
              <dd>{r.typeLabel}</dd>
              <dt className="text-muted-foreground">Carga horária</dt>
              <dd>{formatHours(r.hours, 'long')}</dd>
              <dt className="text-muted-foreground">Data do evento</dt>
              <dd>{formatarPeriodo(r.eventStartsAt, r.eventEndsAt)}</dd>
              <dt className="text-muted-foreground">Emitido em</dt>
              <dd>{formatDateLong(r.issuedAt)}</dd>
              {r.outcome === 'valid' && r.contentUpdatedAt ? (
                <>
                  <dt className="text-muted-foreground">Dados atualizados em</dt>
                  <dd>{formatDateLong(r.contentUpdatedAt)}</dd>
                </>
              ) : null}
            </dl>
            {r.outcome === 'valid' ? (
              <p className="text-caption text-muted-foreground">
                Esta página é a fonte oficial. Se o PDF mostrar um nome diferente, vale o
                que está aqui.
              </p>
            ) : null}
          </>
        ) : null}

        {estado === 'erased' ? (
          <p>
            Os dados foram eliminados a pedido da pessoa titular, como prevê a LGPD. Não é
            possível confirmar este documento.
          </p>
        ) : null}
        {tentarDeNovo ? <p>{DICA}</p> : null}
        {consulta.estado === 'limite' ? (
          <p>Você pode tentar de novo em {textoDaContagem(consulta.esperar)}.</p>
        ) : null}
      </section>

      {tentarDeNovo ? (
        <CodeInput
          classeDaFonte={jetBrainsMono.className}
          valorInicial={decodeURIComponent(codigo)}
        />
      ) : null}
    </div>
  )
}
