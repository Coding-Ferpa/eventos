import { drawSvg } from './draw/svg'
import { layout, type FontResolver, type LayoutWarning } from './layout/layout'
import type { TemplateSnapshot } from './schema'
import type { TokenContext } from './tokens'

/**
 * A prévia SVG (doc 05), separada do `index.ts` de propósito: aqui não entra
 * o pdf-lib. É este módulo que o editor carrega no navegador do admin, por
 * `import()`, junto com o fontkit.
 */

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
