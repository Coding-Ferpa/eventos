import 'server-only'

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { FontBytesResolver } from '@/features/certificate/draw/pdf'
import { fallbackFor, findCuratedFont } from '@/features/certificate/fonts/catalog'
import { loadFont, type FontMetrics } from '@/features/certificate/fonts/metrics'
import type { FontResolver } from '@/features/certificate/layout/layout'
import type { TemplateSnapshot } from '@/features/certificate/schema'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * Cache de módulo do motor (doc 05): o `base.pdf` e as fontes de uma instância
 * da função. Com Fluid Compute a instância atende muitas requisições, e o
 * cache aquece na primeira.
 *
 * Guarda a promessa, e não os bytes: cem downloads no cache frio, no pico do
 * dia do evento, viram um download só do Storage. Promessa que falha sai do
 * cache, para a próxima requisição tentar de novo.
 *
 * O `base.pdf` fica em bytes (o `PDFDocument` é mutável, e cada requisição faz
 * o seu `load`); a fonte fica parseada, porque a identidade dos bytes é a
 * chave do cache do fontkit.
 */

/**
 * `public/` é servido pela CDN e não entra no pacote da função sozinho: o
 * `next.config` declara a pasta em `outputFileTracingIncludes`, e o CI
 * confere no rastro do build.
 */
export const PASTA_DAS_FONTES_CURADAS = path.join(
  process.cwd(),
  'public',
  'fonts',
  'cert',
)

export async function lerFonteCuradaDoDisco(arquivo: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(PASTA_DAS_FONTES_CURADAS, arquivo)))
}

async function baixarBasePdfDoStorage(caminho: string): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin()
    .storage.from('templates')
    .download(caminho)
  if (error) throw new Error(`Download do base.pdf falhou: ${error.message}`)
  return new Uint8Array(await data.arrayBuffer())
}

export type CertificateAssetsDeps = {
  baixarBasePdf: (caminho: string) => Promise<Uint8Array>
  lerFonteCurada: (arquivo: string) => Promise<Uint8Array>
}

type FonteCarregada = { bytes: Uint8Array; metrics: FontMetrics; weight: number }

const LIMITE_DE_BASES = 8

export function createCertificateAssets(deps: CertificateAssetsDeps) {
  // Map lembra a ordem de inserção: o primeiro é o menos usado.
  const bases = new Map<string, Promise<Uint8Array>>()
  const fontes = new Map<string, Promise<FonteCarregada>>()

  function lembrar<T>(
    cache: Map<string, Promise<T>>,
    chave: string,
    carregar: () => Promise<T>,
  ) {
    const pendente = carregar()
    cache.set(chave, pendente)
    pendente.catch(() => {
      if (cache.get(chave) === pendente) cache.delete(chave)
    })
    return pendente
  }

  async function baixarEConferir(caminho: string, esperado: string) {
    const bytes = await deps.baixarBasePdf(caminho)
    const obtido = createHash('sha256').update(bytes).digest('hex')
    if (obtido !== esperado) {
      throw new Error(`O base.pdf em ${caminho} não bate com o sha256 do snapshot.`)
    }
    return bytes
  }

  function basePdf(
    snapshot: Pick<TemplateSnapshot, 'base_pdf_path' | 'base_pdf_sha256'>,
  ): Promise<Uint8Array> {
    const chave = snapshot.base_pdf_sha256
    const existente = bases.get(chave)
    if (existente) {
      bases.delete(chave)
      bases.set(chave, existente)
      return existente
    }
    const pendente = lembrar(bases, chave, () =>
      baixarEConferir(snapshot.base_pdf_path, chave),
    )
    while (bases.size > LIMITE_DE_BASES) bases.delete(bases.keys().next().value!)
    return pendente
  }

  function fonte(ref: string): Promise<FonteCarregada> {
    const existente = fontes.get(ref)
    if (existente) return existente
    return lembrar(fontes, ref, async () => {
      const curada = findCuratedFont(ref)
      if (!curada) {
        throw new Error(`Fonte enviada (${ref}) ainda não tem leitor: chega no M6.`)
      }
      const bytes = await deps.lerFonteCurada(curada.file)
      return { bytes, metrics: loadFont(bytes), weight: curada.weight }
    })
  }

  /**
   * As fontes de que o `layout()` pode precisar: a de cada campo de texto e a
   * de reserva do peso de cada uma. Os resolvedores devolvidos são síncronos,
   * como o motor pede, e pedir outra fonte é erro, nunca reserva silenciosa.
   */
  async function fonts(snapshot: Pick<TemplateSnapshot, 'layout_fields'>) {
    const refs = new Set<string>()
    for (const campo of snapshot.layout_fields)
      if (campo.kind === 'text') refs.add(campo.font)

    const carregadas = new Map<string, FonteCarregada>()
    await Promise.all([...refs].map(async (ref) => carregadas.set(ref, await fonte(ref))))
    for (const { weight } of [...carregadas.values()]) {
      const reserva = fallbackFor(weight).ref
      if (!carregadas.has(reserva)) carregadas.set(reserva, await fonte(reserva))
    }

    const pegar = (ref: string) => {
      const carregada = carregadas.get(ref)
      if (!carregada) throw new Error(`Fonte não carregada para este modelo: ${ref}`)
      return carregada
    }
    const resolver: FontResolver = (ref) => {
      const { metrics, weight } = pegar(ref)
      return { metrics, weight }
    }
    const bytes: FontBytesResolver = (ref) => pegar(ref).bytes
    return { fonts: resolver, fontBytes: bytes }
  }

  return { basePdf, fonts }
}

/** A instância da função: Storage pela chave de serviço, fontes pelo disco. */
export const certificateAssets = createCertificateAssets({
  baixarBasePdf: baixarBasePdfDoStorage,
  lerFonteCurada: lerFonteCuradaDoDisco,
})
