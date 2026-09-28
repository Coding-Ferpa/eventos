import * as fontkit from '@cantoo/fontkit'

/**
 * Adaptador do fontkit para o que o motor precisa de uma fonte (doc 05):
 * medida, linhas de base, cobertura e contornos para o SVG.
 *
 * A medida é a mesma conta que o pdf-lib faz ao desenhar: soma dos
 * `advanceWidth` dos glifos de `font.layout(texto, FONT_FEATURES)`, sem
 * kerning, porque o pdf-lib também não aplica kerning. Medir de outro jeito
 * faria o layout prometer uma largura e o PDF desenhar outra.
 */

/** Ligaduras desligadas: medida, PDF e SVG concordam glifo a glifo. */
export const FONT_FEATURES = { liga: false } as const

const parseadas = new WeakMap<Uint8Array, fontkit.Font>()

/**
 * O fontkit que o motor registra no pdf-lib (`registerFontkit`). Memoriza a
 * fonte parseada pela identidade dos bytes: o pdf-lib chama `create` a cada
 * `embedFont`, e parsear de novo a cada download custaria de 5 a 15 ms.
 */
export const cachedFontkit = {
  create(bytes: Uint8Array): fontkit.Font {
    const existente = parseadas.get(bytes)
    if (existente) return existente

    const resultado = fontkit.create(bytes)
    if (!('unitsPerEm' in resultado)) {
      throw new Error('Coleção de fontes (TTC) não é aceita: envie um arquivo por fonte.')
    }
    parseadas.set(bytes, resultado)
    return resultado
  },
}

export type Glyph = { id: number; path: string; advance: number }

export type FontMetrics = {
  readonly font: fontkit.Font
  readonly unitsPerEm: number
  /** Da tabela `hhea`, em unidades da fonte; o descent é negativo. */
  readonly ascent: number
  readonly descent: number
  /** Largura do texto em pt, no tamanho dado. */
  widthAt(texto: string, tamanho: number): number
  /** Caracteres do texto que a fonte não tem, sem repetição, na ordem. */
  missingCharacters(texto: string): string[]
  /**
   * Contornos SVG em unidades da fonte (y para cima) e o avanço de cada
   * glifo. O `id` é o índice do glifo na fonte: a mesma letra repete o id.
   */
  glyphs(texto: string): Glyph[]
}

export function loadFont(bytes: Uint8Array): FontMetrics {
  const font = cachedFontkit.create(bytes)
  const glifos = (texto: string) => font.layout(texto, FONT_FEATURES).glyphs

  return {
    font,
    unitsPerEm: font.unitsPerEm,
    ascent: font.ascent,
    descent: font.descent,
    widthAt(texto, tamanho) {
      const avanco = glifos(texto).reduce((soma, glifo) => soma + glifo.advanceWidth, 0)
      return (avanco / font.unitsPerEm) * tamanho
    },
    missingCharacters(texto) {
      const tem = (caractere: string) => {
        // Fonte sem mapa de caracteres utilizável faz o fontkit lançar; para a
        // cobertura, é o mesmo que não ter o caractere.
        try {
          return font.hasGlyphForCodePoint(caractere.codePointAt(0) ?? 0)
        } catch {
          return false
        }
      }
      return [...new Set(texto)].filter((caractere) => !tem(caractere))
    },
    glyphs(texto) {
      return glifos(texto).map((glifo) => ({
        id: glifo.id,
        path: glifo.path.toSVG(),
        advance: glifo.advanceWidth,
      }))
    },
  }
}
