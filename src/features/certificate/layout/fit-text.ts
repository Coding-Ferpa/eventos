/**
 * Ajuste de texto numa caixa (doc 05). Garantias, que são os critérios do PRD:
 * nunca vaza da caixa, nunca corta texto, nunca usa reticências. O preço é que
 * um nome absurdo numa caixa minúscula sai pequeno, com o aviso `belowMin`
 * para o admin ver antes da emissão.
 *
 * Como a largura é linear no tamanho, encolher é uma divisão, e não uma
 * busca: `measure(texto)` devolve a largura no tamanho 1.
 */

/**
 * O nome do "testar com o nome mais longo" quando o evento ainda não tem
 * participantes (doc 05).
 */
export const CANONICAL_LONG_NAME = 'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues'

export type FitMode = 'shrink_then_wrap' | 'wrap_then_shrink'

export type FitInput = {
  text: string
  widthPt: number
  heightPt: number
  sizePt: number
  minSizePt: number
  maxLines: number
  lineHeight: number
  mode: FitMode
  measure: (texto: string) => number
}

export type FitResult = { sizePt: number; lines: string[]; belowMin: boolean }

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const PISO_DO_PARAGRAFO_PT = 4
const PASSO_DO_PARAGRAFO_PT = 0.5
const IGUAL = 1e-9

const passoDeQuarto = (tamanho: number) => Math.floor(tamanho * 4) / 4

/** Todas as formas de dividir as palavras em `n` linhas, só nos espaços. */
function* divisoes(palavras: string[], n: number): Generator<string[]> {
  if (n === 1) {
    yield [palavras.join(' ')]
    return
  }
  for (let corte = 1; corte <= palavras.length - (n - 1); corte++) {
    const primeira = palavras.slice(0, corte).join(' ')
    for (const resto of divisoes(palavras.slice(corte), n - 1)) {
      yield [primeira, ...resto]
    }
  }
}

/** Quantas linhas terminam em partícula: no empate, vence quem tem menos. */
function particulasNoFim(linhas: string[]): number {
  return linhas
    .slice(0, -1)
    .filter((linha) =>
      PARTICULAS.has(linha.slice(linha.lastIndexOf(' ') + 1).toLowerCase()),
    ).length
}

/**
 * A divisão em `n` linhas que minimiza a linha mais larga (busca exaustiva:
 * um nome tem no máximo uns 12 espaços).
 */
function melhorDivisao(palavras: string[], n: number, measure: (t: string) => number) {
  let melhor: { linhas: string[]; maior: number } | null = null
  for (const linhas of divisoes(palavras, n)) {
    const maior = Math.max(...linhas.map(measure))
    if (
      !melhor ||
      maior < melhor.maior - IGUAL ||
      (Math.abs(maior - melhor.maior) <= IGUAL &&
        particulasNoFim(linhas) < particulasNoFim(melhor.linhas))
    ) {
      melhor = { linhas, maior }
    }
  }
  return melhor!
}

function encolherDepoisQuebrar(entrada: FitInput, palavras: string[]): FitResult {
  const { widthPt: W, heightPt: H, sizePt, minSizePt, lineHeight, measure } = entrada
  const texto = palavras.join(' ')

  const umaLinha = passoDeQuarto(Math.min(sizePt, W / measure(texto), H / lineHeight))
  if (umaLinha >= minSizePt) return { sizePt: umaLinha, lines: [texto], belowMin: false }

  const maximo = Math.min(entrada.maxLines, palavras.length)
  let ultima: FitResult = { sizePt: umaLinha, lines: [texto], belowMin: true }

  for (let n = 2; n <= maximo; n++) {
    const { linhas, maior } = melhorDivisao(palavras, n, measure)
    const tamanho = passoDeQuarto(Math.min(sizePt, W / maior, H / (n * lineHeight)))
    if (tamanho >= minSizePt) return { sizePt: tamanho, lines: linhas, belowMin: false }
    ultima = { sizePt: tamanho, lines: linhas, belowMin: true }
  }

  // Nada coube no mínimo: vale a última tentativa, abaixo do mínimo, e o
  // texto continua inteiro e dentro da caixa.
  return ultima
}

/** Quebra gulosa: cada linha leva o máximo de palavras que cabe na largura. */
function quebraGulosa(
  palavras: string[],
  larguraEmTamanho1: number,
  measure: (t: string) => number,
) {
  const linhas: string[] = []
  let atual = ''
  for (const palavra of palavras) {
    const candidata = atual ? `${atual} ${palavra}` : palavra
    if (atual && measure(candidata) > larguraEmTamanho1) {
      linhas.push(atual)
      atual = palavra
    } else {
      atual = candidata
    }
  }
  if (atual) linhas.push(atual)
  return linhas
}

function quebrarDepoisEncolher(entrada: FitInput, palavras: string[]): FitResult {
  const { widthPt: W, heightPt: H, lineHeight, measure } = entrada

  for (
    let tamanho = entrada.sizePt;
    tamanho >= PISO_DO_PARAGRAFO_PT;
    tamanho -= PASSO_DO_PARAGRAFO_PT
  ) {
    const linhas = quebraGulosa(palavras, W / tamanho, measure)
    const cabe =
      linhas.length <= entrada.maxLines &&
      linhas.length * lineHeight * tamanho <= H &&
      linhas.every((linha) => measure(linha) * tamanho <= W)
    if (cabe) {
      return { sizePt: tamanho, lines: linhas, belowMin: tamanho < entrada.minSizePt }
    }
  }

  // Nem no piso coube: o piso, com o aviso. Acontece só com caixa absurda.
  const linhas = quebraGulosa(palavras, W / PISO_DO_PARAGRAFO_PT, measure)
  return { sizePt: PISO_DO_PARAGRAFO_PT, lines: linhas, belowMin: true }
}

export function fitText(entrada: FitInput): FitResult {
  const palavras = entrada.text.split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return { sizePt: entrada.sizePt, lines: [], belowMin: false }

  return entrada.mode === 'shrink_then_wrap'
    ? encolherDepoisQuebrar(entrada, palavras)
    : quebrarDepoisEncolher(entrada, palavras)
}
