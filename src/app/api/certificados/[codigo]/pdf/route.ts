import { after, type NextRequest } from 'next/server'

import {
  getCertificateForDownload,
  recordDownload,
  recordPdfFailure,
} from '@/db/queries/public-lookup'
import { generateCertificatePdf } from '@/features/certificate'
import { normalizeCode } from '@/features/certificate/code'
import { certificateEtag } from '@/features/certificate/etag'
import { contentDisposition } from '@/features/certificate/filename'
import { semBanco } from '@/lib/ambiente'
import { certificateAssets } from '@/lib/certificate-assets'
import {
  abrirRetirada,
  COOKIE_DE_RETIRADA,
  type OrigemDaRetirada,
} from '@/lib/cookies/retrieval'
import { db } from '@/db/client'
import { serverEnv, siteEnv } from '@/lib/env'
import { textoDaContagem } from '@/lib/espera'
import { problema } from '@/lib/problema'
import { consumirBalde, LIMITES } from '@/lib/rate-limit'
import { requisitante } from '@/lib/requisicao'

/**
 * `GET /api/certificados/{codigo}/pdf`: o caminho quente (doc 05). Abre o
 * cookie, aplica o limite, lê o certificado numa consulta, responde 304 pelo
 * ETag sem rodar o motor, e gera o PDF sob demanda. É navegação de usuário:
 * sessão vencida e falha do motor redirecionam para telas, e não para JSON.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const NAO_ENCONTRADO = 'Não encontramos esse certificado.'

const ORIGEM_DO_DOWNLOAD: Record<
  OrigemDaRetirada,
  'search' | 'email_link' | 'my_certificates'
> = {
  search_cpf: 'search',
  search_email: 'search',
  search_name: 'search',
  search_all: 'search',
  token: 'email_link',
  mine: 'my_certificates',
}

function redirecionar(caminho: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: caminho, 'Cache-Control': 'no-store' },
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  if (semBanco()) return problema(404, 'not_found', NAO_ENCONTRADO)
  const code = normalizeCode((await params).codigo)
  if (!code) return problema(404, 'not_found', NAO_ENCONTRADO)

  const env = serverEnv()
  const quem = requisitante(request, env)
  for (const [chave, janelas] of [
    [`download:dev:${quem.deviceHash}`, LIMITES.downloadPorDispositivo],
    [`download:ip:${quem.ipHash}`, LIMITES.downloadPorIp],
  ] as const) {
    const veredito = await consumirBalde(db(), chave, janelas)
    if (!veredito.permitido) {
      return problema(
        429,
        'rate_limited',
        `Muitas tentativas seguidas. Você pode tentar de novo em ${textoDaContagem(veredito.esperarSegundos)}.`,
        { headers: { 'Retry-After': String(veredito.esperarSegundos) } },
      )
    }
  }

  const retirada = abrirRetirada(
    request.cookies.get(COOKIE_DE_RETIRADA)?.value,
    Buffer.from(env.RETRIEVAL_COOKIE_KEY, 'base64'),
  )
  const dados = await getCertificateForDownload(code, retirada?.pids ?? [])
  if (dados.outcome === 'not_found') return problema(404, 'not_found', NAO_ENCONTRADO)
  if (!retirada) return redirecionar(`/eventos/${dados.eventSlug}?sessao=expirada`)
  // De outra pessoa responde igual a inexistente (doc 07).
  if (dados.outcome === 'other_person') return problema(404, 'not_found', NAO_ENCONTRADO)
  if (dados.outcome === 'revoked' || dados.outcome === 'erased') {
    return new Response('Este certificado não está mais disponível.', {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }

  const falhou = () => {
    after(() => recordPdfFailure(code))
    return redirecionar(`/eventos/${dados.eventSlug}/certificado?erro=geracao`)
  }
  if (!dados.snapshot) return falhou()

  const context = { ...dados.context, siteUrl: siteEnv().NEXT_PUBLIC_SITE_URL }
  const etag = await certificateEtag({
    basePdfSha256: dados.snapshot.base_pdf_sha256,
    templateVersion: dados.snapshot.version,
    certificateVersion: dados.certificateVersion,
    context,
  })
  const cabecalhos = {
    ETag: etag,
    'Cache-Control': 'private, no-cache',
    'X-Robots-Tag': 'noindex',
  }
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: cabecalhos })
  }

  let pdf: Uint8Array
  try {
    const [basePdf, { fonts, fontBytes }] = await Promise.all([
      certificateAssets.basePdf(dados.snapshot),
      certificateAssets.fonts(dados.snapshot),
    ])
    pdf = (
      await generateCertificatePdf({
        snapshot: dados.snapshot,
        context,
        basePdf,
        fonts,
        fontBytes,
      })
    ).pdf
  } catch {
    return falhou()
  }

  after(() =>
    recordDownload(code, {
      source: ORIGEM_DO_DOWNLOAD[retirada.src],
      deviceHash: quem.deviceHash,
    }),
  )
  return new Response(new Uint8Array(pdf), {
    headers: {
      ...cabecalhos,
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(
        dados.eventSlug,
        context.participant.fullName,
      ),
    },
  })
}
