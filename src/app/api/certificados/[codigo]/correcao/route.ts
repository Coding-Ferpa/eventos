import { after, type NextRequest } from 'next/server'

import { db } from '@/db/client'
import { createCorrectionRequest } from '@/db/queries/public-lookup'
import { normalizeCode } from '@/features/certificate/code'
import { semBanco } from '@/lib/ambiente'
import { abrirRetirada, COOKIE_DE_RETIRADA } from '@/lib/cookies/retrieval'
import { avisoDePedidoDeCorrecao, enviarEmail } from '@/lib/email'
import { serverEnv, siteEnv } from '@/lib/env'
import { formatarEspera } from '@/lib/espera'
import { origemDoSite, problema, SEM_CACHE } from '@/lib/problema'
import { consumirBalde, LIMITES } from '@/lib/rate-limit'
import { requisitante } from '@/lib/requisicao'
import { z } from '@/lib/zod'

/**
 * `POST /api/certificados/{codigo}/correcao` (doc 07): "meu nome está errado".
 * Mesma autorização do download (o cookie de retirada). O e-mail à
 * organização sai depois da resposta, em `after()`, e a falha dele nunca
 * desfaz o pedido.
 */

export const runtime = 'nodejs'

const entradaSchema = z.object({
  requested_name: z.string().trim().min(3, 'Digite o nome como deve sair.').max(120),
  contact: z
    .string()
    .trim()
    .min(5, 'Deixe um e-mail ou telefone para a resposta.')
    .max(120),
  message: z.string().trim().max(500).optional(),
})

const NAO_ENCONTRADO = 'Não encontramos esse certificado entre os seus.'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ codigo: string }> },
) {
  if (semBanco()) return problema(404, 'not_found', NAO_ENCONTRADO)
  if (!origemDoSite(request))
    return problema(403, 'forbidden', 'Este pedido só funciona pela tela do certificado.')

  const code = normalizeCode((await params).codigo)
  if (!code) return problema(404, 'not_found', NAO_ENCONTRADO)
  const env = serverEnv()
  const retirada = abrirRetirada(
    request.cookies.get(COOKIE_DE_RETIRADA)?.value,
    Buffer.from(env.RETRIEVAL_COOKIE_KEY, 'base64'),
  )
  if (!retirada) {
    return problema(
      401,
      'unauthorized',
      'Por segurança, esta tela expirou. Busque de novo, leva poucos segundos.',
    )
  }

  const lido = entradaSchema.safeParse(await request.json().catch(() => null))
  if (!lido.success) {
    return problema(422, 'validation_error', 'Confira os campos destacados.', {
      fieldErrors: z.flattenError(lido.error).fieldErrors as Record<string, string[]>,
    })
  }

  const quem = requisitante(request, env)
  const resultado = await db().transaction(async (tx) => {
    // O rate limit roda antes de qualquer consulta a pessoa (doc 07).
    for (const [chave, janelas] of [
      [`correction:dev:${quem.deviceHash}`, LIMITES.correcaoPorDispositivo],
      [`correction:cert:${code}`, LIMITES.correcaoPorCertificado],
    ] as const) {
      const veredito = await consumirBalde(tx, chave, janelas)
      if (!veredito.permitido) return { limite: veredito.esperarSegundos }
    }
    return createCorrectionRequest(tx, code, retirada.pids, {
      requestedName: lido.data.requested_name,
      contact: lido.data.contact,
      message: lido.data.message || null,
    })
  })

  if ('limite' in resultado) {
    return problema(
      429,
      'rate_limited',
      `Muitas tentativas seguidas. Você pode tentar de novo em ${formatarEspera(resultado.limite)}.`,
      { headers: { 'Retry-After': String(resultado.limite) } },
    )
  }
  if (resultado.outcome === 'not_found') return problema(404, 'not_found', NAO_ENCONTRADO)
  if (resultado.outcome === 'pending') {
    return problema(
      409,
      'correction_already_pending',
      'Já existe um pedido de correção para este certificado. A organização vai revisar, e não precisa pedir de novo.',
    )
  }

  const { aviso } = resultado
  after(async () => {
    await enviarEmail({
      para: aviso.para,
      ...avisoDePedidoDeCorrecao({
        evento: aviso.evento,
        nomeAtual: aviso.nomeAtual,
        nomePedido: lido.data.requested_name,
        contato: lido.data.contact,
        mensagem: lido.data.message || null,
        link: `${siteEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}${aviso.caminhoNoAdmin}`,
      }),
    })
  })
  return Response.json({ ok: true }, { status: 201, headers: SEM_CACHE })
}
