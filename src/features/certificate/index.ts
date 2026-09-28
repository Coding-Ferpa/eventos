import { drawPdf, type FontBytesResolver } from './draw/pdf'
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

// A prévia mora num módulo sem pdf-lib, para o editor carregá-la no navegador.
export { renderCertificateSvg, type CertificateSvgInput } from './preview'
