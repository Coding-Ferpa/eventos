// @vitest-environment node

import { createHash } from 'node:crypto'

import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'

import { arteJpg, artePdf, artePng, artes } from '../../../tests/support/artes'
import { fontesCuradas } from '../../../tests/support/certificado'
import { ArtError, buildBasePdf, type ArtErrorCode } from './base-pdf'
import { layout } from './layout/layout'
import type { TemplateSnapshot } from './schema'
import type { TokenContext } from './tokens'

async function recusa(artesDoTeste: Uint8Array[], codigo: ArtErrorCode) {
  const erro = await buildBasePdf(artesDoTeste).catch((e: unknown) => e)
  expect(erro).toBeInstanceOf(ArtError)
  expect((erro as ArtError).code).toBe(codigo)
  return erro as ArtError
}

const CONTEXTO: TokenContext = {
  siteUrl: 'https://eventos.codingferpa.org',
  participant: { fullName: 'José Gonçalves', cpfLast3: null },
  event: {
    title: 'Ferpa Tech Day 2026',
    locationName: null,
    city: 'Fernandópolis',
    startsAt: new Date('2026-09-12T11:00:00Z'),
    endsAt: null,
  },
  participation: { label: 'Participante' },
  certificate: { hours: 8, code: 'DEM0CF2026', issuedAt: null, sequence: 1, data: {} },
}

function modeloSobre(
  paginas: { width_pt: number; height_pt: number }[],
): TemplateSnapshot {
  return {
    schema_version: 1,
    version: 1,
    base_pdf_path: 'modelo/base.pdf',
    base_pdf_sha256: 'a'.repeat(64),
    base_pdf_size_bytes: 1,
    pages: paginas.map((pagina) => ({ ...pagina, preview_path: null })),
    data_fields: [],
    layout_fields: [
      {
        id: 'nome',
        kind: 'text',
        page: 1,
        box: { x: 0.1, y: 0.4, w: 0.8, h: 0.12 },
        content: '{{participant.full_name}}',
        font: 'curated:poppins-600',
        size_pt: 32,
        min_size_pt: 14,
        color: '#1E1E1E',
        h_align: 'center',
        v_align: 'middle',
        line_height: 1.15,
        max_lines: 2,
        fit: 'shrink_then_wrap',
        transform: 'none',
      },
      {
        id: 'qr',
        kind: 'qr',
        page: 1,
        box: { x: 0.8, y: 0.7, w: 0.15, h: 0.25 },
        dark: '#000000',
        light: '#FFFFFF',
      },
    ],
  }
}

describe('buildBasePdf: a página canônica', () => {
  // PDF-16 do doc 05.
  it('arte A4 paisagem em PDF fica idêntica', async () => {
    const base = await buildBasePdf([await artes.a4Paisagem()])
    expect(base.pages).toEqual([{ width_pt: 841.89, height_pt: 595.28 }])

    const lido = await PDFDocument.load(base.bytes)
    expect(lido.getPageCount()).toBe(1)
    const { width, height } = lido.getPage(0).getSize()
    expect([width, height]).toEqual([841.89, 595.28])
  })

  // PDF-07 do doc 05.
  it('arte 16:9 vira 841,89 × 473,56, e os campos caem no mesmo lugar relativo', async () => {
    const base = await buildBasePdf([await artes.pdf16x9()])
    expect(base.pages).toEqual([{ width_pt: 841.89, height_pt: 473.56 }])

    const plano = layout(modeloSobre(base.pages), CONTEXTO, fontesCuradas)
    const qr = plano.pages[0]!.items.find((item) => item.kind === 'qr')!
    if (qr.kind !== 'qr') return
    const lado = Math.min(0.15 * 841.89, 0.25 * 473.56)
    expect(qr.sizePt).toBeCloseTo(lado, 1)
    expect(qr.xPt).toBeCloseTo(0.8 * 841.89 + (0.15 * 841.89 - lado) / 2, 1)
    expect(qr.yPt).toBeCloseTo(0.7 * 473.56, 1)
  })

  // PDF-06 do doc 05: o critério "de 150 para 300 dpi". A arte de 300 dpi tem
  // 3508 × 2480 px (26 MB crus), que o pdf-lib decodifica e recomprime: sob a
  // instrumentação de cobertura, passa dos 5 s padrão.
  it(
    'a mesma arte em 150 e em 300 dpi dá planos idênticos',
    { timeout: 30_000 },
    async () => {
      const [baixa, alta] = await Promise.all([
        buildBasePdf([artes.dpi150()]),
        buildBasePdf([artes.dpi300()]),
      ])
      expect(baixa.pages).toEqual(alta.pages)
      expect(layout(modeloSobre(baixa.pages), CONTEXTO, fontesCuradas)).toEqual(
        layout(modeloSobre(alta.pages), CONTEXTO, fontesCuradas),
      )

      expect(baixa.warnings.map((aviso) => aviso.code)).toEqual(['ART_LOW_RESOLUTION'])
      expect(alta.warnings).toEqual([])
    },
  )

  it('frente e verso: cada página com a sua página canônica', async () => {
    const base = await buildBasePdf([await artes.duasPaginas()])
    expect(base.pages).toEqual([
      { width_pt: 841.89, height_pt: 595.28 },
      { width_pt: 595.28, height_pt: 841.89 },
    ])
    expect((await PDFDocument.load(base.bytes)).getPageCount()).toBe(2)
  })

  it('frente e verso em imagem são dois arquivos', async () => {
    const base = await buildBasePdf([artePng(2480, 1754), artePng(1754, 2480)])
    expect(base.pages.map((pagina) => pagina.width_pt > pagina.height_pt)).toEqual([
      true,
      false,
    ])
  })

  it('usa a CropBox, que é o que o leitor de PDF mostra, e não a sangria', async () => {
    const base = await buildBasePdf([
      await artePdf([[841.89, 595.28]], { sangria: true }),
    ])
    expect(base.pages).toEqual([{ width_pt: 841.89, height_pt: 595.28 }])

    // O desenho incorporado é recortado na CropBox: a sangria de 20 pt e a
    // marca de corte ficam de fora.
    const caixa = /\/BBox \[ ([\d. ]+) \]/.exec(
      Buffer.from(base.bytes).toString('latin1'),
    )
    expect(caixa![1]!.split(' ').map(Number)).toEqual([20, 20, 861.89, 615.28])
  })

  // PDF-16 do doc 05: embedPage copia só o desenho da página.
  it('JavaScript, formulário e metadados da arte não passam para o base.pdf', async () => {
    const arte = await artePdf([[841.89, 595.28]], { javascript: true, formulario: true })
    const original = Buffer.from(arte).toString('latin1')
    expect(original).toMatch(/\/JavaScript/)
    expect(original).toMatch(/\/AcroForm/)

    expect(original).toMatch(/\/AA/)

    // O embedPage copia o nó inteiro da página, e o que vier junto fica no
    // arquivo mesmo sem ninguém apontar para ele.
    const texto = Buffer.from((await buildBasePdf([arte])).bytes).toString('latin1')
    for (const proibido of ['/JavaScript', '/JS', '/AA', '/AcroForm', '/Widget', '/FT']) {
      expect(texto).not.toContain(proibido)
    }
    expect(texto).not.toMatch(/\/Annots\s*\[\s*[^\]\s]/)
  })

  it('JPG entra sem recompressão: os bytes da arte estão dentro do base.pdf', async () => {
    const jpg = arteJpg(2480, 1754)
    const base = await buildBasePdf([jpg])
    expect(Buffer.from(base.bytes).indexOf(Buffer.from(jpg))).toBeGreaterThan(0)
    expect(base.pages).toEqual([{ width_pt: 841.89, height_pt: 595.43 }])
  })

  it('a mesma arte dá o mesmo base.pdf, com o sha256 dos bytes', async () => {
    const arte = await artes.a4Paisagem()
    const [um, outro] = [await buildBasePdf([arte]), await buildBasePdf([arte])]
    expect(um.sha256).toBe(outro.sha256)
    // Sem data nem produtor, que mudariam o sha256 a cada segundo.
    expect(Buffer.from(um.bytes).toString('latin1')).not.toMatch(
      /\/(Producer|CreationDate|ModDate)/,
    )
    expect(um.sha256).toBe(createHash('sha256').update(um.bytes).digest('hex'))
    expect(um.bytes.byteLength).toBeLessThanOrEqual(3 * 1024 * 1024)
  })
})

// PDF-15 do doc 05.
describe('buildBasePdf: recusas', () => {
  it('PDF com página girada', async () => {
    const erro = await recusa([await artes.rotacionada()], 'ART_ROTATED')
    expect(erro.message).toMatch(/sem rotação/)
  })

  it('JPG com orientação EXIF: o navegador giraria a prévia, e o PDF não', async () => {
    await recusa([arteJpg(2480, 1754, { orientacao: 6 })], 'ART_ROTATED')
  })

  it('PDF cifrado, com senha de abertura ou só de permissões', async () => {
    await recusa([await artes.cifrada()], 'ART_ENCRYPTED')
    await recusa(
      [await artePdf([[841.89, 595.28]], { senhaDoDono: 'dono' })],
      'ART_ENCRYPTED',
    )
  })

  it('mais de duas páginas, num PDF ou somando arquivos', async () => {
    const tres = await artePdf([
      [841.89, 595.28],
      [841.89, 595.28],
      [841.89, 595.28],
    ])
    await recusa([tres], 'ART_TOO_MANY_PAGES')
    await recusa([await artes.duasPaginas(), artePng(2480, 1754)], 'ART_TOO_MANY_PAGES')
  })

  it('imagem com o lado maior abaixo de 1.200 px', async () => {
    const erro = await recusa([artePng(1100, 780)], 'ART_TOO_SMALL')
    expect(erro.message).toContain('1100 × 780 px')
    await recusa([arteJpg(1100, 780)], 'ART_TOO_SMALL')
  })

  it('base.pdf acima de 3 MB, com a instrução de exportar em PDF ou JPG', async () => {
    const erro = await recusa([artes.pesada()], 'ART_TOO_HEAVY')
    expect(erro.message).toMatch(/PDF \(recomendado\) ou JPG/)
  })

  it('WebP e bytes que não são arte', async () => {
    const webp = new Uint8Array([
      ...Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1'),
      ...new Uint8Array(16),
    ])
    await recusa([webp], 'ART_UNSUPPORTED_TYPE')
    await recusa(
      [new Uint8Array(Buffer.from('<svg xmlns="x"/>'))],
      'ART_UNSUPPORTED_TYPE',
    )
  })

  it('PDF que não abre', async () => {
    await recusa(
      [new Uint8Array(Buffer.from('%PDF-1.7\nlixo sem objeto nenhum'))],
      'ART_UNREADABLE',
    )
  })
})
