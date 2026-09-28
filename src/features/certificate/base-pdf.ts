import { EncryptedPDFError, PDFDocument, PDFName, type PDFPage } from '@cantoo/pdf-lib'

import { tipoDeImagemPelosBytes } from '@/lib/image-signature'

import { round2 } from './layout/coords'

/**
 * A arte vira o `base.pdf` canônico uma vez, na publicação (doc 05). O
 * caminho quente nunca sabe se a arte era PDF ou imagem.
 *
 * Página canônica: o maior lado mede 841,89 pt, e o outro acompanha a
 * proporção. Assim "32 pt" significa o mesmo em qualquer arte, e a mesma arte
 * em outra resolução não desalinha nenhum campo. O tamanho é arredondado a
 * 0,01 pt e é o mesmo número no PDF, no modelo e no plano.
 */

export const CANONICAL_SIDE_PT = 841.89
/** A resposta de uma Vercel Function vai até 4,5 MB; o resto é fonte e texto. */
export const BASE_PDF_MAX_BYTES = 3 * 1024 * 1024
export const ART_MIN_SIDE_PX = 1200
export const ART_PRINT_SIDE_PX = 2000
const MAX_PAGINAS = 2

export type ArtErrorCode =
  | 'ART_ENCRYPTED'
  | 'ART_ROTATED'
  | 'ART_TOO_MANY_PAGES'
  | 'ART_TOO_SMALL'
  | 'ART_TOO_HEAVY'
  | 'ART_UNSUPPORTED_TYPE'
  | 'ART_UNREADABLE'

/** Recusa da arte, com a mensagem que o admin lê. */
export class ArtError extends Error {
  constructor(
    readonly code: ArtErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ArtError'
  }
}

export type ArtWarning = { page: number; code: 'ART_LOW_RESOLUTION'; detail: string }

export type BasePdf = {
  bytes: Uint8Array
  sha256: string
  pages: { width_pt: number; height_pt: number }[]
  warnings: ArtWarning[]
}

type Arte =
  { tipo: 'pdf'; paginas: PDFPage[] } | { tipo: 'png' | 'jpg'; bytes: Uint8Array }

function tipoDaArte(bytes: Uint8Array): Arte['tipo'] | null {
  const imagem = tipoDeImagemPelosBytes(bytes)
  if (imagem === 'png' || imagem === 'jpg') return imagem
  if (imagem) return null
  // O %PDF- pode vir depois de lixo, até 1.024 bytes, e os leitores aceitam.
  const inicio = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return inicio.includes('%PDF-') ? 'pdf' : null
}

/**
 * Orientation (0x0112) do EXIF de um JPEG; 1 quando não há. O navegador gira
 * a imagem por ela, e o pdf-lib não: a prévia e o PDF discordariam.
 */
function orientacaoExif(jpg: Uint8Array): number {
  const dados = new DataView(jpg.buffer, jpg.byteOffset, jpg.byteLength)
  try {
    for (
      let i = 2;
      jpg[i] === 0xff && jpg[i + 1] !== 0xda;
      i += 2 + dados.getUint16(i + 2)
    ) {
      const exif = new TextDecoder('latin1').decode(jpg.subarray(i + 4, i + 10))
      if (jpg[i + 1] !== 0xe1 || exif !== 'Exif\0\0') continue

      const tiff = i + 10
      const le = dados.getUint16(tiff) === 0x4949
      const ifd = tiff + dados.getUint32(tiff + 4, le)
      for (let e = 0; e < dados.getUint16(ifd, le); e++) {
        const entrada = ifd + 2 + e * 12
        if (dados.getUint16(entrada, le) === 0x0112)
          return dados.getUint16(entrada + 8, le)
      }
    }
  } catch {
    // EXIF truncado: o navegador também o ignora.
  }
  return 1
}

async function ler(bytes: Uint8Array): Promise<Arte> {
  const tipo = tipoDaArte(bytes)
  if (!tipo)
    throw new ArtError('ART_UNSUPPORTED_TYPE', 'Envie a arte em PDF, PNG ou JPG.')

  if (tipo !== 'pdf') {
    const orientacao = orientacaoExif(bytes)
    if (tipo === 'jpg' && orientacao > 1 && orientacao <= 8) {
      throw new ArtError(
        'ART_ROTATED',
        'O JPG tem uma marca de rotação da câmera. Exporte de novo já na orientação final, sem rotação.',
      )
    }
    return { tipo, bytes }
  }

  let paginas: PDFPage[]
  try {
    paginas = (await PDFDocument.load(bytes, { updateMetadata: false })).getPages()
  } catch (erro) {
    if (erro instanceof EncryptedPDFError) {
      throw new ArtError(
        'ART_ENCRYPTED',
        'O PDF da arte está protegido por senha. Exporte de novo sem proteção.',
      )
    }
    paginas = []
  }
  if (paginas.length === 0) {
    throw new ArtError(
      'ART_UNREADABLE',
      'Não conseguimos ler o PDF da arte. Exporte de novo.',
    )
  }
  return { tipo: 'pdf', paginas }
}

async function sha256(bytes: Uint8Array) {
  const resumo = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  )
}

/** O que a página precisa para ser desenhada; o resto não atravessa. */
const SO_O_DESENHO = new Set(
  ['Type', 'Parent', 'Resources', 'Contents', 'MediaBox', 'CropBox', 'Rotate'].map(
    (chave) => PDFName.of(chave),
  ),
)

/**
 * O `embedPage` copia o nó inteiro da página para o documento novo. O que não
 * é desenho (anotações e widgets de formulário, ações `/AA` com JavaScript,
 * metadados) ficaria gravado no arquivo mesmo sem ninguém apontar para ele.
 */
function soODesenho(pagina: PDFPage) {
  for (const chave of pagina.node.keys()) {
    if (!SO_O_DESENHO.has(chave)) pagina.node.delete(chave)
  }
}

/** PDF de 1 ou 2 páginas, ou uma imagem por página (frente e verso são dois arquivos). */
export async function buildBasePdf(artes: Uint8Array[]): Promise<BasePdf> {
  if (artes.length === 0) throw new Error('buildBasePdf precisa de ao menos uma arte.')

  const lidas: Arte[] = []
  for (const bytes of artes) lidas.push(await ler(bytes))
  const total = lidas.reduce(
    (n, arte) => n + (arte.tipo === 'pdf' ? arte.paginas.length : 1),
    0,
  )
  if (total > MAX_PAGINAS) {
    throw new ArtError(
      'ART_TOO_MANY_PAGES',
      `A arte tem ${total} páginas. O certificado aceita frente e verso, no máximo 2.`,
    )
  }

  // Sem data nem produtor: a mesma arte dá os mesmos bytes e o mesmo sha256.
  const saida = await PDFDocument.create({ updateMetadata: false })
  const pages: BasePdf['pages'] = []
  const warnings: ArtWarning[] = []

  function paginaCanonica(largura: number, altura: number) {
    const k = CANONICAL_SIDE_PT / Math.max(largura, altura)
    const tamanho = { width_pt: round2(largura * k), height_pt: round2(altura * k) }
    pages.push(tamanho)
    return { pagina: saida.addPage([tamanho.width_pt, tamanho.height_pt]), ...tamanho }
  }

  for (const arte of lidas) {
    if (arte.tipo === 'pdf') {
      for (const origem of arte.paginas) {
        if (((origem.getRotation().angle % 360) + 360) % 360 !== 0) {
          throw new ArtError(
            'ART_ROTATED',
            `A página ${pages.length + 1} do PDF está girada. Exporte de novo na orientação final, sem rotação.`,
          )
        }
        // A CropBox é o que o leitor mostra; a MediaBox pode ter sangria e
        // marcas de corte.
        const corte = origem.getCropBox()
        soODesenho(origem)
        const desenho = await saida.embedPage(origem, {
          left: corte.x,
          bottom: corte.y,
          right: corte.x + corte.width,
          top: corte.y + corte.height,
        })
        const { pagina, width_pt, height_pt } = paginaCanonica(corte.width, corte.height)
        pagina.drawPage(desenho, { x: 0, y: 0, width: width_pt, height: height_pt })
      }
      continue
    }

    // PNG sem perda; JPG passa direto, sem recompressão.
    const imagem =
      arte.tipo === 'png'
        ? await saida.embedPng(arte.bytes)
        : await saida.embedJpg(arte.bytes)
    const maior = Math.max(imagem.width, imagem.height)
    if (maior < ART_MIN_SIDE_PX) {
      throw new ArtError(
        'ART_TOO_SMALL',
        `A imagem tem ${imagem.width} × ${imagem.height} px. O lado maior precisa de pelo menos 1.200 px; prefira 2.000 px ou mais para impressão.`,
      )
    }
    const { pagina, width_pt, height_pt } = paginaCanonica(imagem.width, imagem.height)
    if (maior < ART_PRINT_SIDE_PX) {
      warnings.push({
        page: pages.length,
        code: 'ART_LOW_RESOLUTION',
        detail: `A imagem tem ${imagem.width} × ${imagem.height} px: serve para a tela, mas pode sair serrilhada impressa. Prefira 2.000 px ou mais no lado maior.`,
      })
    }
    pagina.drawImage(imagem, { x: 0, y: 0, width: width_pt, height: height_pt })
  }

  const bytes = await saida.save({ useObjectStreams: false })
  if (bytes.byteLength > BASE_PDF_MAX_BYTES) {
    const mb = (bytes.byteLength / 1024 / 1024).toFixed(1).replace('.', ',')
    throw new ArtError(
      'ART_TOO_HEAVY',
      `A arte ficou com ${mb} MB, e o limite é 3 MB. Exporte a arte como PDF (recomendado) ou JPG em alta qualidade.`,
    )
  }
  return { bytes, sha256: await sha256(bytes), pages, warnings }
}
