/**
 * Fontes curadas (doc 05): TTF estáticos em `public/fonts/cert/`, referenciados
 * no modelo como `curated:<família>-<peso>`. Não ficam no banco.
 *
 * No M5 só a Poppins: das cinco famílias do doc 05, é a única distribuída em
 * estáticos por peso. As outras quatro entram no M6, com ADR próprio.
 */

export type CuratedFont = {
  ref: string
  family: string
  weight: number
  file: string
}

export const CURATED_FONTS: readonly CuratedFont[] = [
  {
    ref: 'curated:poppins-400',
    family: 'Poppins',
    weight: 400,
    file: 'Poppins-Regular.ttf',
  },
  {
    ref: 'curated:poppins-600',
    family: 'Poppins',
    weight: 600,
    file: 'Poppins-SemiBold.ttf',
  },
  {
    ref: 'curated:poppins-700',
    family: 'Poppins',
    weight: 700,
    file: 'Poppins-Bold.ttf',
  },
]

export function findCuratedFont(ref: string): CuratedFont | undefined {
  return CURATED_FONTS.find((fonte) => fonte.ref === ref)
}

/**
 * Família de reserva para glifo ausente (doc 05). O doc pede a Inter, que só
 * chega no M6; até lá, a Poppins, que cobre o português e o latim estendido.
 */
const FAMILIA_DE_RESERVA = 'Poppins'

/** A fonte de reserva de peso mais próximo; no empate, a mais leve. */
export function fallbackFor(peso: number): CuratedFont {
  const candidatas = CURATED_FONTS.filter((fonte) => fonte.family === FAMILIA_DE_RESERVA)
  return candidatas.reduce((melhor, fonte) =>
    Math.abs(fonte.weight - peso) < Math.abs(melhor.weight - peso) ? fonte : melhor,
  )
}
