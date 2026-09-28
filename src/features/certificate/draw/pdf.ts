import { PDFDocument, rgb, type PDFFont } from '@cantoo/pdf-lib'

import { formatCode } from '../code'
import { cachedFontkit, FONT_FEATURES } from '../fonts/metrics'
import { toPdfY } from '../layout/coords'
import type { QrItem, RenderPlan, TextItem } from '../layout/layout'

/**
 * Desenhista PDF (doc 05): executa o plano sobre o `base.pdf`, sem decidir
 * nada. O texto é texto de verdade (selecionável, extraível, acessível), e o
 * QR é vetorial.
 *
 * O plano mede y a partir do topo; o PDF, a partir da base. A conversão é o
 * `toPdfY`, e como o PDF posiciona texto pela linha de base, que é o que o
 * plano guarda, não há altura de fonte a somar.
 */

export type FontBytesResolver = (ref: string) => Uint8Array
export type PdfMetadata = { eventTitle: string; code: string }

function cor(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export async function drawPdf(
  plano: RenderPlan,
  basePdf: Uint8Array,
  bytesDaFonte: FontBytesResolver,
  metadados: PdfMetadata,
): Promise<Uint8Array> {
  const documento = await PDFDocument.load(basePdf)
  if (documento.getPageCount() !== plano.pages.length) {
    throw new Error(
      `O base.pdf tem ${documento.getPageCount()} página(s), e o plano, ${plano.pages.length}.`,
    )
  }
  documento.registerFontkit(cachedFontkit)

  // Uma incorporação por fonte e por documento: o subset carrega só os
  // glifos usados neste certificado.
  const fontes = new Map<string, PDFFont>()
  async function fonte(ref: string) {
    let embutida = fontes.get(ref)
    if (!embutida) {
      embutida = await documento.embedFont(bytesDaFonte(ref), {
        subset: true,
        features: FONT_FEATURES,
      })
      fontes.set(ref, embutida)
    }
    return embutida
  }

  for (const [indice, pagina] of plano.pages.entries()) {
    const destino = documento.getPage(indice)

    for (const item of pagina.items) {
      if (item.kind === 'text') {
        desenharTexto(destino, item, pagina.heightPt, await fonte(item.font))
      } else {
        desenharQr(destino, item, pagina.heightPt)
      }
    }
  }

  documento.setTitle(`Certificado: ${metadados.eventTitle}`)
  documento.setAuthor('Coding Ferpa')
  documento.setSubject(`Código de validação ${formatCode(metadados.code)}`)
  documento.setLanguage('pt-BR')
  documento.setCreator('CF Eventos')
  documento.setProducer('CF Eventos')

  // Sem object streams: a imagem do base.pdf já vem comprimida, e o ganho de
  // tamanho não paga a CPU no pico do dia do evento (doc 05).
  return documento.save({ useObjectStreams: false })
}

type Pagina = ReturnType<PDFDocument['getPage']>

function desenharTexto(pagina: Pagina, item: TextItem, altura: number, fonte: PDFFont) {
  for (const linha of item.lines) {
    pagina.drawText(linha.text, {
      x: linha.xPt,
      y: toPdfY(altura, linha.baselineYPt),
      size: item.sizePt,
      font: fonte,
      color: cor(item.color),
    })
  }
}

function desenharQr(pagina: Pagina, item: QrItem, altura: number) {
  if (item.light) {
    pagina.drawRectangle({
      x: item.xPt,
      y: toPdfY(altura, item.yPt + item.sizePt),
      width: item.sizePt,
      height: item.sizePt,
      color: cor(item.light),
    })
  }
  // O drawSvgPath trabalha em coordenadas de SVG (y para baixo) a partir do
  // ponto dado, que é o canto de cima do QR.
  pagina.drawSvgPath(item.path, {
    x: item.xPt,
    y: toPdfY(altura, item.yPt),
    scale: item.sizePt / item.modules,
    color: cor(item.dark),
    borderWidth: 0,
  })
}
