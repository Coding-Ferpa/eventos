import { drawPdf, type FontBytesResolver } from './draw/pdf'
import { drawSvg } from './draw/svg'
import { layout, type FontResolver, type LayoutWarning } from './layout/layout'
import type { TemplateSnapshot } from './schema'
import type { TokenContext } from './tokens'

/**
 * As duas portas do motor (doc 05). Quem chama entrega o snapshot publicado,
 * o contexto do certificado e as fontes; o motor não lê banco, Storage nem
 * disco. O `base.pdf` e as fontes vêm do cache de módulo
 * (`lib/certificate-assets.ts`).
 */

export type CertificatePdfInput = {
  snapshot: TemplateSnapshot
  context: TokenContext
  basePdf: Uint8Array
  fonts: FontResolver
  fontBytes: FontBytesResolver
}

export async function generateCertificatePdf(
  entrada: CertificatePdfInput,
): Promise<{ pdf: Uint8Array; warnings: LayoutWarning[] }> {
  const plano = layout(entrada.snapshot, entrada.context, entrada.fonts)
  const pdf = await drawPdf(plano, entrada.basePdf, entrada.fontBytes, {
    eventTitle: entrada.context.event.title,
    code: entrada.context.certificate.code,
  })
  return { pdf, warnings: plano.warnings }
}

export type CertificateSvgInput = {
  snapshot: TemplateSnapshot
  context: TokenContext
  fonts: FontResolver
  /** 1 é a frente, 2 é o verso. */
  page: number
  backgroundUrl: string | null
}

export function renderCertificateSvg(entrada: CertificateSvgInput): {
  svg: string
  warnings: LayoutWarning[]
} {
  const plano = layout(entrada.snapshot, entrada.context, entrada.fonts)
  const pagina = plano.pages[entrada.page - 1]
  if (!pagina) {
    throw new Error(`O modelo não tem a página ${entrada.page}.`)
  }
  const nome = entrada.context.participant.fullName
  return {
    svg: drawSvg(pagina, entrada.fonts, {
      backgroundUrl: entrada.backgroundUrl,
      label:
        entrada.page === 1
          ? `Prévia do certificado de ${nome}`
          : `Verso do certificado de ${nome}`,
    }),
    warnings: plano.warnings,
  }
}
