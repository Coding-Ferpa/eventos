import { fallbackFor } from '../fonts/catalog'
import type { FontMetrics } from '../fonts/metrics'
import { applyTransform } from '../format'
import { buildQr, QR_MIN_SIDE_PT } from '../qr'
import type { QrField, TemplateSnapshot, TextField } from '../schema'
import { resolveTokens, type TokenContext } from '../tokens'
import { round2, toPt, type PageSize } from './coords'
import { fitText } from './fit-text'

/**
 * `layout()` é a única peça que decide (ADR-0003): transforma o modelo, os
 * dados do certificado e as fontes num plano de renderização. Os dois
 * desenhistas, PDF e SVG, só executam o plano. É isso que faz a prévia e o
 * PDF concordarem por construção.
 *
 * O plano é JSON serializável e arredondado a 0,01 pt, e os snapshots o
 * congelam. O motor não sabe se os números vieram do formulário (M6) ou do
 * arrastar (M10).
 */

export type PlanLine = { text: string; xPt: number; baselineYPt: number; widthPt: number }

export type TextItem = {
  kind: 'text'
  fieldId: string
  /** A fonte de fato usada: a do campo, ou a de reserva se faltou glifo. */
  font: string
  sizePt: number
  color: string
  lines: PlanLine[]
}

export type QrItem = {
  kind: 'qr'
  fieldId: string
  xPt: number
  yPt: number
  sizePt: number
  /** Módulos por lado, com a zona de silêncio: a escala é `sizePt / modules`. */
  modules: number
  /** Em unidades de módulo, y para baixo. */
  path: string
  dark: string
  light: string | null
}

export type PlanItem = TextItem | QrItem
export type PagePlan = { widthPt: number; heightPt: number; items: PlanItem[] }

export type LayoutWarning = {
  fieldId: string
  code: 'BELOW_MIN_SIZE' | 'GLYPH_FALLBACK' | 'QR_TOO_SMALL'
  detail: string
}

export type RenderPlan = { pages: PagePlan[]; warnings: LayoutWarning[] }

export type ResolvedFont = { metrics: FontMetrics; weight: number }

/** Quem chama entrega as fontes (bytes do disco ou do Storage): o motor é puro. */
export type FontResolver = (ref: string) => ResolvedFont

function escolherFonte(
  campo: TextField,
  texto: string,
  fontes: FontResolver,
  avisos: LayoutWarning[],
) {
  const daCampo = fontes(campo.font)
  const faltando = daCampo.metrics.missingCharacters(texto)
  if (faltando.length === 0) return { ref: campo.font, metrics: daCampo.metrics }

  // Nunca um quadrado vazio no lugar de uma letra: o campo inteiro vai para a
  // fonte de reserva de peso mais próximo (doc 05).
  const reserva = fallbackFor(daCampo.weight)
  const metrics = fontes(reserva.ref).metrics
  const semCobertura = metrics.missingCharacters(texto)
  avisos.push({
    fieldId: campo.id,
    code: 'GLYPH_FALLBACK',
    detail:
      `A fonte do campo não tem ${faltando.join(' ')}; o campo saiu na ${reserva.family}.` +
      (semCobertura.length > 0
        ? ` Sem cobertura em nenhuma fonte: ${semCobertura.join(' ')}.`
        : ''),
  })
  return { ref: reserva.ref, metrics }
}

function textoPosicionado(
  campo: TextField,
  pagina: PageSize,
  contexto: TokenContext,
  modelo: TemplateSnapshot,
  fontes: FontResolver,
  avisos: LayoutWarning[],
): TextItem | null {
  const texto = applyTransform(
    resolveTokens(campo.content, contexto, modelo.data_fields),
    campo.transform,
  )
  if (!texto.trim()) return null

  const fonte = escolherFonte(campo, texto, fontes, avisos)
  const { metrics } = fonte
  const caixa = toPt(campo.box, pagina)

  const ajuste = fitText({
    text: texto,
    widthPt: caixa.w,
    heightPt: caixa.h,
    sizePt: campo.size_pt,
    minSizePt: campo.min_size_pt,
    maxLines: campo.max_lines,
    lineHeight: campo.line_height,
    mode: campo.fit,
    measure: (trecho) => metrics.widthAt(trecho, 1),
  })
  const s = ajuste.sizePt
  if (ajuste.belowMin) {
    avisos.push({
      fieldId: campo.id,
      code: 'BELOW_MIN_SIZE',
      detail: `Saiu em ${round2(s)} pt, abaixo do mínimo de ${campo.min_size_pt} pt.`,
    })
  }

  const alturaDaLinha = campo.line_height * s
  const bloco = ajuste.lines.length * alturaDaLinha
  const topo =
    campo.v_align === 'top'
      ? caixa.y
      : campo.v_align === 'bottom'
        ? caixa.y + caixa.h - bloco
        : caixa.y + (caixa.h - bloco) / 2

  // Linha de base dentro da linha: o corpo (ascent - descent) centrado na
  // altura da linha, e a base a um ascent do topo do corpo (doc 05).
  const escala = s / metrics.unitsPerEm
  const corpo = (metrics.ascent - metrics.descent) * escala
  const baseNaLinha = (alturaDaLinha - corpo) / 2 + metrics.ascent * escala

  const lines = ajuste.lines.map((linha, i) => {
    const largura = metrics.widthAt(linha, s)
    const x =
      campo.h_align === 'left'
        ? caixa.x
        : campo.h_align === 'right'
          ? caixa.x + caixa.w - largura
          : caixa.x + (caixa.w - largura) / 2
    return {
      text: linha,
      xPt: round2(x),
      baselineYPt: round2(topo + i * alturaDaLinha + baseNaLinha),
      widthPt: round2(largura),
    }
  })

  return {
    kind: 'text',
    fieldId: campo.id,
    font: fonte.ref,
    sizePt: s,
    color: campo.color,
    lines,
  }
}

function qrPosicionado(
  campo: QrField,
  pagina: PageSize,
  contexto: TokenContext,
  avisos: LayoutWarning[],
): QrItem {
  const caixa = toPt(campo.box, pagina)
  const lado = Math.min(caixa.w, caixa.h)
  if (lado < QR_MIN_SIDE_PT) {
    avisos.push({
      fieldId: campo.id,
      code: 'QR_TOO_SMALL',
      detail: `O QR tem ${round2(lado)} pt de lado, abaixo de 2 cm (${QR_MIN_SIDE_PT} pt).`,
    })
  }

  const url = `${contexto.siteUrl.replace(/\/+$/, '')}/validar/${contexto.certificate.code}`
  const { modules, path } = buildQr(url)
  return {
    kind: 'qr',
    fieldId: campo.id,
    xPt: round2(caixa.x + (caixa.w - lado) / 2),
    yPt: round2(caixa.y + (caixa.h - lado) / 2),
    sizePt: round2(lado),
    modules,
    path,
    dark: campo.dark,
    light: campo.light,
  }
}

export function layout(
  modelo: TemplateSnapshot,
  contexto: TokenContext,
  fontes: FontResolver,
): RenderPlan {
  const avisos: LayoutWarning[] = []

  const pages = modelo.pages.map((dados, indice) => {
    const pagina: PageSize = { widthPt: dados.width_pt, heightPt: dados.height_pt }
    const items: PlanItem[] = []

    for (const campo of modelo.layout_fields) {
      if (campo.page !== indice + 1) continue
      if (campo.kind === 'qr') {
        items.push(qrPosicionado(campo, pagina, contexto, avisos))
      } else {
        const item = textoPosicionado(campo, pagina, contexto, modelo, fontes, avisos)
        if (item) items.push(item)
      }
    }
    return { widthPt: pagina.widthPt, heightPt: pagina.heightPt, items }
  })

  return { pages, warnings: avisos }
}
