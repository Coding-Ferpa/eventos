import type { Box } from '../schema'

/**
 * Três espaços de coordenadas (doc 05): o normalizado (0 a 1, topo-esquerda),
 * o do plano (pt da página canônica, topo-esquerda) e o do PDF (pt,
 * base-esquerda). Esta é a única fronteira entre eles.
 */

export type PageSize = { widthPt: number; heightPt: number }
export type BoxPt = { x: number; y: number; w: number; h: number }

export function toPt(box: Box, pagina: PageSize): BoxPt {
  return {
    x: box.x * pagina.widthPt,
    y: box.y * pagina.heightPt,
    w: box.w * pagina.widthPt,
    h: box.h * pagina.heightPt,
  }
}

/** A única inversão de eixo do sistema. `yTopoPt` é medido a partir do topo. */
export function toPdfY(alturaDaPaginaPt: number, yTopoPt: number): number {
  return alturaDaPaginaPt - yTopoPt
}

/** O plano é arredondado a 0,01 pt: é ele que os snapshots congelam. */
export function round2(valor: number): number {
  return Math.round(valor * 100) / 100
}
