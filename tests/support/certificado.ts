import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { PDFDocument } from '@cantoo/pdf-lib'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

import { CURATED_FONTS } from '@/features/certificate/fonts/catalog'
import { loadFont } from '@/features/certificate/fonts/metrics'
import type { FontResolver } from '@/features/certificate/layout/layout'

/**
 * Apoio dos testes do motor de certificado: fontes do disco, um base.pdf
 * sintético e a extração de texto com posição pelo pdf.js (doc 05).
 */

export const PASTA_DAS_FONTES = path.resolve(process.cwd(), 'public/fonts/cert')

/** Cada TTF da pasta: fonte nova entra no gate sozinha (doc 12). */
export function ttfsDaPasta(): string[] {
  return readdirSync(PASTA_DAS_FONTES).filter((arquivo) => arquivo.endsWith('.ttf'))
}

const bytesPorArquivo = new Map<string, Uint8Array>()

/** Os mesmos bytes a cada chamada: o cache de fonte é por identidade. */
export function bytesDaFonte(arquivo: string): Uint8Array {
  let bytes = bytesPorArquivo.get(arquivo)
  if (!bytes) {
    bytes = new Uint8Array(readFileSync(path.join(PASTA_DAS_FONTES, arquivo)))
    bytesPorArquivo.set(arquivo, bytes)
  }
  return bytes
}

export function arquivoDaReferencia(ref: string): string {
  const curada = CURATED_FONTS.find((fonte) => fonte.ref === ref)
  if (!curada) throw new Error(`Fonte fora do catálogo no teste: ${ref}`)
  return curada.file
}

export const fontesCuradas: FontResolver = (ref) => {
  const curada = CURATED_FONTS.find((fonte) => fonte.ref === ref)
  if (!curada) throw new Error(`Fonte fora do catálogo no teste: ${ref}`)
  return { metrics: loadFont(bytesDaFonte(curada.file)), weight: curada.weight }
}

export const bytesCurados = (ref: string) => ({
  bytes: bytesDaFonte(arquivoDaReferencia(ref)),
  subset: true,
})

/** Um base.pdf em branco, com as páginas pedidas (A4 paisagem por padrão). */
export async function basePdfEmBranco(
  paginas: [number, number][] = [[841.89, 595.28]],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const tamanho of paginas) doc.addPage(tamanho)
  return doc.save()
}

export type TrechoExtraido = { text: string; x: number; y: number; size: number }

/** Texto de cada página, com a posição da linha de base e o tamanho. */
export async function extrairTexto(pdf: Uint8Array): Promise<TrechoExtraido[][]> {
  const tarefa = getDocument({ data: pdf.slice(), useSystemFonts: false })
  const documento = await tarefa.promise
  const paginas: TrechoExtraido[][] = []

  for (let numero = 1; numero <= documento.numPages; numero++) {
    const conteudo = await (await documento.getPage(numero)).getTextContent()
    paginas.push(
      conteudo.items
        .filter((item) => 'str' in item && item.str.length > 0)
        .map((item) => {
          const trecho = item as { str: string; transform: number[] }
          return {
            text: trecho.str,
            x: trecho.transform[4]!,
            y: trecho.transform[5]!,
            size: trecho.transform[0]!,
          }
        }),
    )
  }
  await tarefa.destroy()
  return paginas
}
