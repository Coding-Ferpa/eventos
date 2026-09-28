import { fallbackFor, findCuratedFont } from '@/features/certificate/fonts/catalog'
import { loadFont, type FontMetrics } from '@/features/certificate/fonts/metrics'
import type { FontResolver } from '@/features/certificate/layout/layout'
import {
  renderCertificateSvg,
  type CertificateSvgInput,
} from '@/features/certificate/preview'

/**
 * O motor de certificado rodando no navegador do admin (doc 05): a prévia do
 * editor é o mesmo layout() e o mesmo desenhista SVG da tela de retirada, e
 * por isso concorda com o PDF por construção. O editor carrega este módulo por
 * import(), e o fontkit fica fora do pacote de qualquer outra tela.
 */

export type FonteEnviada = { id: string; weight: number; url: string }

type Carregada = { metrics: FontMetrics; weight: number }

// Uma busca por fonte enquanto a aba estiver aberta.
const cache = new Map<string, Promise<Carregada>>()

async function bytesDe(url: string) {
  const resposta = await fetch(url)
  if (!resposta.ok) throw new Error(`A fonte não carregou (${resposta.status}).`)
  return new Uint8Array(await resposta.arrayBuffer())
}

function carregar(ref: string, enviadas: Map<string, FonteEnviada>): Promise<Carregada> {
  const existente = cache.get(ref)
  if (existente) return existente

  const promessa = (async () => {
    if (ref.startsWith('custom:')) {
      const enviada = enviadas.get(ref.slice('custom:'.length))
      if (!enviada) throw new Error(`Fonte enviada sem endereço: ${ref}`)
      return { metrics: loadFont(await bytesDe(enviada.url)), weight: enviada.weight }
    }
    const curada = findCuratedFont(ref)
    if (!curada) throw new Error(`Fonte fora do catálogo: ${ref}`)
    return {
      metrics: loadFont(await bytesDe(`/fonts/cert/${curada.file}`)),
      weight: curada.weight,
    }
  })()
  cache.set(ref, promessa)
  promessa.catch(() => cache.delete(ref))
  return promessa
}

/** As fontes dos campos e a reserva do peso de cada uma, como no servidor. */
export async function prepararFontes(
  refs: string[],
  enviadas: FonteEnviada[],
): Promise<FontResolver> {
  const porId = new Map(enviadas.map((fonte) => [fonte.id, fonte]))
  const prontas = new Map<string, Carregada>()
  for (const ref of new Set(refs)) prontas.set(ref, await carregar(ref, porId))
  for (const { weight } of [...prontas.values()]) {
    const reserva = fallbackFor(weight).ref
    if (!prontas.has(reserva)) prontas.set(reserva, await carregar(reserva, porId))
  }
  return (ref) => {
    const fonte = prontas.get(ref)
    if (!fonte) throw new Error(`Fonte não carregada: ${ref}`)
    return fonte
  }
}

export function desenharPrevia(entrada: CertificateSvgInput) {
  return renderCertificateSvg(entrada)
}
