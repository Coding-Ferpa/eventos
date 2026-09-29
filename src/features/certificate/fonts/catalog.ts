/**
 * Fontes curadas (doc 05, ADR-0016): TTF estáticos em `public/fonts/cert/`,
 * referenciados no modelo como `curated:<família>-<peso>`. Não ficam no banco.
 *
 * Quatro famílias, as que a distribuição de cada projeto entrega em estático
 * por peso. O Playfair Display só existe como variável, e o pdf-lib embute a
 * variável sem instanciar o eixo de peso (sairia 400 em tudo): ficou fora, e
 * volta se a arte real da comunidade usar aquele desenho.
 */

export type CuratedFont = {
  ref: string
  family: string
  weight: number
  file: string
}

const PESOS = [
  [400, 'Regular'],
  [600, 'SemiBold'],
  [700, 'Bold'],
] as const

function familia(nome: string, prefixo: string): CuratedFont[] {
  return PESOS.map(([weight, sufixo]) => ({
    ref: `curated:${nome.toLowerCase()}-${weight}`,
    family: nome,
    weight,
    file: `${prefixo}-${sufixo}.ttf`,
  }))
}

export const CURATED_FONTS: readonly CuratedFont[] = [
  ...familia('Poppins', 'Poppins'),
  ...familia('Inter', 'Inter'),
  ...familia('Montserrat', 'Montserrat'),
  ...familia('Lora', 'Lora'),
]

export function findCuratedFont(ref: string): CuratedFont | undefined {
  return CURATED_FONTS.find((fonte) => fonte.ref === ref)
}

/**
 * Família de reserva para glifo ausente (doc 05). A Inter é a única das quatro
 * que cobre vietnamita, grego e cirílico, além do latim estendido (medido no
 * ADR-0016): nome fora do Latin-1 sai nela, nunca com um quadrado no lugar da
 * letra.
 */
const FAMILIA_DE_RESERVA = 'Inter'

/** A fonte de reserva de peso mais próximo; no empate, a mais leve. */
export function fallbackFor(peso: number): CuratedFont {
  const candidatas = CURATED_FONTS.filter((fonte) => fonte.family === FAMILIA_DE_RESERVA)
  return candidatas.reduce((melhor, fonte) =>
    Math.abs(fonte.weight - peso) < Math.abs(melhor.weight - peso) ? fonte : melhor,
  )
}
