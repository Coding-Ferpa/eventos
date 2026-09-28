import { randomBytes } from 'node:crypto'
import { deflateSync } from 'node:zlib'

import { degrees, PDFDocument, PDFName, PDFString, rgb } from '@cantoo/pdf-lib'

/**
 * Artes sintéticas do doc 05, geradas em memória: uma arte de 3 MB de ruído
 * no git seria peso morto, e arte sintética não ganha nada por ser arquivo.
 * Os nomes seguem a lista de fixtures do doc 05.
 */

type OpcoesPdf = {
  rotacao?: number
  senhaDoUsuario?: string
  senhaDoDono?: string
  javascript?: boolean
  formulario?: boolean
  /** Sangria de 20 pt em volta da CropBox, com marca de corte fora dela. */
  sangria?: boolean
}

/** Arte vetorial: retângulos e linhas, sem fonte, como sai de um editor. */
export async function artePdf(
  paginas: [number, number][],
  opcoes: OpcoesPdf = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (const [largura, altura] of paginas) {
    const s = opcoes.sangria ? 20 : 0
    const pagina = doc.addPage([largura + 2 * s, altura + 2 * s])
    if (opcoes.sangria) {
      pagina.setCropBox(s, s, largura, altura)
      pagina.drawRectangle({ x: 0, y: 0, width: 10, height: 10, color: rgb(1, 0, 0) })
    }
    pagina.drawRectangle({
      x: s + 20,
      y: s + 20,
      width: largura - 40,
      height: altura - 40,
      borderColor: rgb(0.1, 0.3, 0.6),
      borderWidth: 6,
    })
    pagina.drawLine({
      start: { x: s + 40, y: s + altura / 2 },
      end: { x: s + largura - 40, y: s + altura / 2 },
      thickness: 1,
    })
    if (opcoes.rotacao) pagina.setRotation(degrees(opcoes.rotacao))
  }
  if (opcoes.javascript) {
    // No catálogo e na abertura da página, os dois lugares onde arte traz script.
    doc.addJavaScript('boasVindas', 'app.alert("oi")')
    doc
      .getPage(0)
      .node.set(
        PDFName.of('AA'),
        doc.context.obj({ O: { S: 'JavaScript', JS: PDFString.of('app.alert(1)') } }),
      )
  }
  if (opcoes.formulario) {
    doc.getForm().createTextField('nome').addToPage(doc.getPage(0), { x: 60, y: 60 })
  }
  if (opcoes.senhaDoUsuario !== undefined || opcoes.senhaDoDono !== undefined) {
    doc.encrypt({
      userPassword: opcoes.senhaDoUsuario,
      ownerPassword: opcoes.senhaDoDono,
    })
  }
  return doc.save()
}

function crc32(dados: Buffer): number {
  let crc = 0xffffffff
  for (const byte of dados) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function blocoPng(tipo: string, dados: Buffer) {
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([tamanho, corpo, crc])
}

/**
 * PNG RGB. Com `ruido`, bytes aleatórios guardados sem compressão: o arquivo
 * tem o tamanho dos pixels e nenhum compressor o reduz.
 */
export function artePng(
  largura: number,
  altura: number,
  { ruido = false } = {},
): Uint8Array {
  const linha = largura * 3 + 1
  const pixels = ruido ? randomBytes(linha * altura) : Buffer.alloc(linha * altura, 0xe8)
  // Cada linha começa com o filtro 0 do PNG.
  for (let y = 0; y < altura; y++) pixels[y * linha] = 0
  const cabecalho = Buffer.alloc(13)
  cabecalho.writeUInt32BE(largura, 0)
  cabecalho.writeUInt32BE(altura, 4)
  cabecalho[8] = 8
  cabecalho[9] = 2
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      blocoPng('IHDR', cabecalho),
      blocoPng('IDAT', deflateSync(pixels, { level: ruido ? 0 : 6 })),
      blocoPng('IEND', Buffer.alloc(0)),
    ]),
  )
}

function segmento(marcador: number, dados: number[]) {
  const tamanho = dados.length + 2
  return [0xff, marcador, tamanho >> 8, tamanho & 255, ...dados]
}

/**
 * JPEG baseline de verdade, cinza uniforme, montado à mão: cada bloco 8×8 é
 * DC 0 e fim de bloco, dois bits com tabelas de Huffman de um código só.
 * Decodifica em qualquer leitor, e o teste não precisa de codificador.
 */
export function arteJpg(
  largura: number,
  altura: number,
  { orientacao = 1 } = {},
): Uint8Array {
  const exif =
    orientacao === 1
      ? []
      : segmento(0xe1, [
          ...Buffer.from('Exif\0\0', 'latin1'),
          // TIFF little-endian, IFD0 no byte 8, uma entrada: Orientation (0x0112).
          ...[0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00],
          ...[0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientacao, 0, 0, 0],
          ...[0x00, 0x00, 0x00, 0x00],
        ])
  const huffman = (classe: number) => [classe, 1, ...Array<number>(15).fill(0), 0x00]
  const blocos = Math.ceil(largura / 8) * Math.ceil(altura / 8)
  const bits = blocos * 2
  const dados = new Array<number>(Math.ceil(bits / 8)).fill(0)
  if (bits % 8) dados[dados.length - 1] = (1 << (8 - (bits % 8))) - 1

  return new Uint8Array([
    0xff,
    0xd8,
    ...segmento(0xe0, [...Buffer.from('JFIF\0', 'latin1'), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...exif,
    ...segmento(0xdb, [0, ...Array<number>(64).fill(1)]),
    ...segmento(0xc0, [
      8,
      altura >> 8,
      altura & 255,
      largura >> 8,
      largura & 255,
      1,
      1,
      0x11,
      0,
    ]),
    ...segmento(0xc4, huffman(0x00)),
    ...segmento(0xc4, huffman(0x10)),
    ...segmento(0xda, [1, 1, 0x00, 0, 63, 0]),
    ...dados,
    0xff,
    0xd9,
  ])
}

/** A lista de fixtures do doc 05. */
export const artes = {
  a4Paisagem: () => artePdf([[841.89, 595.28]]),
  dpi150: () => artePng(1754, 1240),
  dpi300: () => artePng(3508, 2480),
  pdf16x9: () => artePdf([[960, 540]]),
  duasPaginas: () =>
    artePdf([
      [841.89, 595.28],
      [595.28, 841.89],
    ]),
  rotacionada: () => artePdf([[595.28, 841.89]], { rotacao: 90 }),
  cifrada: () => artePdf([[841.89, 595.28]], { senhaDoUsuario: 'segredo' }),
  pesada: () => artePng(1400, 800, { ruido: true }),
}
