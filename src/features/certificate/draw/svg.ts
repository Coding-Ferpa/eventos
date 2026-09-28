import type { FontResolver, PagePlan, QrItem, TextItem } from '../layout/layout'

/**
 * Desenhista SVG (doc 05): a prévia executa o mesmo plano que o PDF. Texto
 * vira contorno de glifo, então a prévia não depende de fonte instalada nem
 * de webfont, e nenhuma fonte é servida ao público.
 *
 * O viewBox é em pt e usa os números do plano sem conversão. Cada linha é um
 * grupo `translate(x linhaDeBase) scale(k -k)`, com k = tamanho / unitsPerEm:
 * o contorno vem em unidades da fonte com y para cima, e o `-k` o espelha.
 *
 * Cada glifo entra uma vez em `<defs>` e é reusado por `<use>`: um parágrafo
 * típico cai de uns 50 KB para uns 15 KB. O id nasce da fonte e do índice do
 * glifo, e por isso o mesmo id é sempre o mesmo contorno, mesmo com duas
 * prévias na mesma página.
 *
 * Roda no servidor (tela de retirada) e no navegador do admin (editor): nada
 * de API do Node aqui.
 */

export type SvgOptions = {
  /** URL do fundo da prévia; null enquanto a arte não tem prévia. */
  backgroundUrl: string | null
  /** "Prévia do certificado de {nome}": o SVG é uma imagem só para o leitor de tela. */
  label: string
}

function escapar(texto: string) {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Número curto: o plano já vem a 0,01 pt, e a escala precisa de mais casas. */
function num(valor: number, casas = 2) {
  return String(Number(valor.toFixed(casas)))
}

function idDoGlifo(fonte: string, glifo: number) {
  return `cf-${fonte.replaceAll(/[^A-Za-z0-9_-]/g, '-')}-${glifo}`
}

export function drawSvg(
  pagina: PagePlan,
  fontes: FontResolver,
  opcoes: SvgOptions,
): string {
  const definidos = new Map<string, string>()
  const corpo: string[] = []

  for (const item of pagina.items) {
    corpo.push(item.kind === 'text' ? texto(item, fontes, definidos) : qr(item))
  }

  const largura = num(pagina.widthPt)
  const altura = num(pagina.heightPt)
  const fundo = opcoes.backgroundUrl
    ? `<image href="${escapar(opcoes.backgroundUrl)}" width="${largura}" height="${altura}" preserveAspectRatio="none"/>`
    : `<rect width="${largura}" height="${altura}" fill="#FFFFFF"/>`
  const defs =
    definidos.size > 0
      ? `<defs>${[...definidos].map(([id, d]) => `<path id="${id}" d="${d}"/>`).join('')}</defs>`
      : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="${escapar(opcoes.label)}">` +
    defs +
    fundo +
    corpo.join('') +
    '</svg>'
  )
}

function texto(item: TextItem, fontes: FontResolver, definidos: Map<string, string>) {
  const { metrics } = fontes(item.font)
  const k = num(item.sizePt / metrics.unitsPerEm, 7)

  const linhas = item.lines.map((linha) => {
    let avanco = 0
    const usos = metrics.glyphs(linha.text).map((glifo) => {
      const id = idDoGlifo(item.font, glifo.id)
      if (!definidos.has(id)) definidos.set(id, glifo.path)
      const uso =
        avanco === 0 ? `<use href="#${id}"/>` : `<use href="#${id}" x="${avanco}"/>`
      avanco += glifo.advance
      return uso
    })
    return `<g transform="translate(${num(linha.xPt)} ${num(linha.baselineYPt)}) scale(${k} -${k})">${usos.join('')}</g>`
  })

  return `<g data-field="${escapar(item.fieldId)}" fill="${item.color}">${linhas.join('')}</g>`
}

function qr(item: QrItem) {
  const escala = num(item.sizePt / item.modules, 7)
  const fundo = item.light
    ? `<rect width="${item.modules}" height="${item.modules}" fill="${item.light}"/>`
    : ''
  // Sem antialiasing entre módulos vizinhos: sem ele, aparecem fios claros
  // entre as linhas do QR na tela.
  return (
    `<g data-field="${escapar(item.fieldId)}" transform="translate(${num(item.xPt)} ${num(item.yPt)}) scale(${escala})" shape-rendering="crispEdges">` +
    fundo +
    `<path d="${item.path}" fill="${item.dark}"/>` +
    '</g>'
  )
}
