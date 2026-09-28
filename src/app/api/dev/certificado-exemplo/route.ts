import { buildBasePdf } from '@/features/certificate/base-pdf'
import { generateCertificatePdf } from '@/features/certificate/index'
import { certificateAssets } from '@/lib/certificate-assets'
import { siteEnv } from '@/lib/env'
import { z } from '@/lib/zod'

import { arteDeExemplo, contextoDeExemplo, modeloDeExemplo } from './exemplo'

/**
 * Certificado de exemplo para desenvolvimento e para a Preview (doc 05): gera
 * um PDF com acentos sem banco nem Storage, lendo as fontes do disco como a
 * rota de download vai ler. É o juiz do DoD do M5: se a fonte não chegou ao
 * pacote da função, este PDF não sai.
 *
 * Desligada em produção: lá a rota não existe.
 */

export const dynamic = 'force-dynamic'

const consultaSchema = z.object({
  nome: z.string().trim().min(1).max(120).default('José Gonçalves de Assunção'),
})

export async function GET(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV === 'production') {
    return new Response('Não encontrado.', { status: 404 })
  }

  const consulta = consultaSchema.safeParse({
    nome: new URL(request.url).searchParams.get('nome') ?? undefined,
  })
  if (!consulta.success) {
    return Response.json(
      { erro: 'O nome precisa ter de 1 a 120 caracteres.' },
      { status: 400 },
    )
  }

  const base = await buildBasePdf([await arteDeExemplo()])
  const snapshot = modeloDeExemplo(base)
  const { fonts, fontBytes } = await certificateAssets.fonts(snapshot)
  const { pdf } = await generateCertificatePdf({
    snapshot,
    context: contextoDeExemplo(consulta.data.nome, siteEnv().NEXT_PUBLIC_SITE_URL),
    basePdf: base.bytes,
    fonts,
    fontBytes,
  })

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="certificado-exemplo.pdf"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
