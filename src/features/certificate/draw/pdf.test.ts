// @vitest-environment node

import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, it } from 'vitest'

import { artePng } from '../../../../tests/support/artes'
import {
  basePdfEmBranco,
  bytesCurados,
  bytesDaFonte,
  extrairTexto,
  fontesCuradas,
} from '../../../../tests/support/certificado'
import { loadFont } from '../fonts/metrics'
import { toPdfY } from '../layout/coords'
import { layout, type FontResolver, type TextItem } from '../layout/layout'
import type { TemplateSnapshot, TextField } from '../schema'
import type { TokenContext } from '../tokens'
import { drawPdf } from './pdf'

const PAGINA = { width_pt: 841.89, height_pt: 595.28, preview_path: null }

function contexto(nome: string): TokenContext {
  return {
    siteUrl: 'https://eventos.codingferpa.org',
    participant: { fullName: nome, cpfLast3: null },
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
}

function campo(parcial: Partial<TextField> = {}): TextField {
  return {
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
    ...parcial,
  }
}

function modelo(campos: TemplateSnapshot['layout_fields']): TemplateSnapshot {
  return {
    schema_version: 1,
    version: 1,
    base_pdf_path: 'modelo/base.pdf',
    base_pdf_sha256: 'a'.repeat(64),
    base_pdf_size_bytes: 1,
    pages: [PAGINA],
    data_fields: [],
    layout_fields: campos,
  }
}

async function gerar(
  campos: TemplateSnapshot['layout_fields'],
  nome: string,
  fontes: FontResolver = fontesCuradas,
  bytes = bytesCurados,
  base?: Uint8Array,
) {
  const plano = layout(modelo(campos), contexto(nome), fontes)
  const pdf = await drawPdf(plano, base ?? (await basePdfEmBranco()), bytes, {
    eventTitle: 'Ferpa Tech Day 2026',
    code: 'DEM0CF2026',
  })
  return { plano, pdf }
}

const NOME = 'José Gonçalves de Assunção'

describe('drawPdf', () => {
  // PDF-01 do doc 05, pelo desenhista; o gate de CI com o motor inteiro é o
  // pdf-accents.test.ts.
  it.each(['curated:poppins-400', 'curated:poppins-600', 'curated:poppins-700'])(
    'o nome acentuado volta idêntico do PDF em %s',
    async (fonte) => {
      const { pdf } = await gerar([campo({ font: fonte })], NOME)
      const [pagina] = await extrairTexto(pdf)

      expect(pagina!.map((trecho) => trecho.text).join('')).toBe(NOME)
    },
  )

  // PDF-09 do doc 05.
  it('posição e tamanho de cada linha batem com o plano, nos 9 alinhamentos, a 0,5 pt', async () => {
    const campos: TextField[] = []
    for (const [i, h] of (['left', 'center', 'right'] as const).entries()) {
      for (const [j, v] of (['top', 'middle', 'bottom'] as const).entries()) {
        campos.push(
          campo({
            id: `${h}-${v}`,
            content: `Alinhado ${h} ${v}`,
            box: { x: 0.05 + i * 0.31, y: 0.05 + j * 0.31, w: 0.28, h: 0.25 },
            size_pt: 14,
            min_size_pt: 8,
            h_align: h,
            v_align: v,
          }),
        )
      }
    }
    const { plano, pdf } = await gerar(campos, NOME)
    const [pagina] = await extrairTexto(pdf)

    for (const item of plano.pages[0]!.items as TextItem[]) {
      const linha = item.lines[0]!
      const trecho = pagina!.find((extraido) => extraido.text === linha.text)
      expect(trecho, linha.text).toBeDefined()
      expect(Math.abs(trecho!.x - linha.xPt)).toBeLessThan(0.5)
      expect(Math.abs(trecho!.y - toPdfY(595.28, linha.baselineYPt))).toBeLessThan(0.5)
      expect(Math.abs(trecho!.size - item.sizePt)).toBeLessThan(0.5)
    }
  })

  // PDF-12 do doc 05.
  it('dois PDFs seguidos com a fonte em cache saem cada um com o seu nome', async () => {
    const primeiro = await gerar([campo()], 'Ana Lima')
    const segundo = await gerar([campo()], NOME)

    expect((await extrairTexto(primeiro.pdf))[0]!.map((t) => t.text).join('')).toBe(
      'Ana Lima',
    )
    expect((await extrairTexto(segundo.pdf))[0]!.map((t) => t.text).join('')).toBe(NOME)
  })

  // PDF-21 do doc 05.
  it('glifo ausente: o PDF sai na fonte de reserva, sem .notdef', async () => {
    const CUSTOM = 'custom:0b4ed4e6-2a4c-4f7e-9d71-1f5e2d3c4b5a'
    const regular = bytesDaFonte('Poppins-Regular.ttf')
    // Uma "fonte enviada" que não tem ç: bytes de verdade, cobertura de mentira.
    const semCedilha = {
      ...loadFont(regular),
      missingCharacters: (t: string) => (t.includes('ç') ? ['ç'] : []),
    }
    const fontes: FontResolver = (ref) =>
      ref === CUSTOM ? { metrics: semCedilha, weight: 400 } : fontesCuradas(ref)
    const bytes = (ref: string) =>
      ref === CUSTOM ? { bytes: regular, subset: true } : bytesCurados(ref)

    const { plano, pdf } = await gerar(
      [campo({ font: CUSTOM })],
      'Conceição',
      fontes,
      bytes,
    )

    expect((plano.pages[0]!.items[0] as TextItem).font).toBe('curated:inter-400')
    expect(plano.warnings.map((aviso) => aviso.code)).toEqual(['GLYPH_FALLBACK'])
    expect((await extrairTexto(pdf))[0]!.map((t) => t.text).join('')).toBe('Conceição')
  })

  it('fonte que falhou na ida e volta do subset vai inteira, e o texto continua certo', async () => {
    const inteira = (ref: string) => ({ ...bytesCurados(ref), subset: false })
    const emSubset = await gerar([campo()], NOME)
    const semSubset = await gerar([campo()], NOME, fontesCuradas, inteira)

    // Medido no M6: 4 KB em subset e 80 KB inteira (os 155 KB da Poppins
    // comprimidos no PDF).
    expect(emSubset.pdf.byteLength).toBeLessThan(10 * 1024)
    expect(semSubset.pdf.byteLength).toBeGreaterThan(60 * 1024)
    expect((await extrairTexto(semSubset.pdf))[0]!.map((t) => t.text).join('')).toBe(NOME)
  })

  // A lacuna do M5, fechada pelo ADR-0016: nome fora do Latin-1 num campo em
  // Poppins cai na Inter e volta idêntico do PDF.
  it.each([
    ['vietnamita', 'Nguyễn Thị Ánh Tuyết'],
    ['grego', 'Γιώργος Παπαδόπουλος'],
    ['cirílico', 'Дмитрий Соколов'],
  ])(
    'nome em %s sai na reserva, inteiro, sem caractere sem cobertura',
    async (_, nome) => {
      const { plano, pdf } = await gerar([campo()], nome)

      expect((plano.pages[0]!.items[0] as TextItem).font).toBe('curated:inter-600')
      expect(plano.warnings).toEqual([
        {
          fieldId: 'nome',
          code: 'GLYPH_FALLBACK',
          detail: expect.not.stringContaining('Sem cobertura'),
        },
      ])
      expect((await extrairTexto(pdf))[0]!.map((t) => t.text).join('')).toBe(nome)
    },
  )

  // PDF-24 do doc 05.
  it('com um base.pdf de 3 MB, o PDF final fica abaixo dos 4,5 MB da Vercel', async () => {
    const base = await basePdfPesado()
    expect(base.byteLength).toBeGreaterThan(2.9 * 1024 * 1024)

    const { pdf } = await gerar([campo()], NOME, fontesCuradas, bytesCurados, base)

    expect(pdf.byteLength).toBeLessThan(4.5 * 1024 * 1024)
  })

  it('grava título, autor e idioma, e o texto do QR não aparece como texto', async () => {
    const { pdf } = await gerar(
      [
        campo(),
        {
          id: 'qr',
          kind: 'qr',
          page: 1,
          box: { x: 0.85, y: 0.8, w: 0.1, h: 0.15 },
          dark: '#000000',
          light: '#FFFFFF',
        },
      ],
      NOME,
    )
    const lido = await PDFDocument.load(pdf)

    expect(lido.getTitle()).toBe('Certificado: Ferpa Tech Day 2026')
    expect(lido.getAuthor()).toBe('Coding Ferpa')
    expect(lido.getSubject()).toBe('Código de validação DEM0-CF2-026')
    expect((await extrairTexto(pdf))[0]!.map((t) => t.text).join('')).toBe(NOME)
  })

  it('recusa base.pdf com número de páginas diferente do plano', async () => {
    const plano = layout(modelo([campo()]), contexto(NOME), fontesCuradas)
    const base = await basePdfEmBranco([
      [841.89, 595.28],
      [841.89, 595.28],
    ])

    await expect(
      drawPdf(plano, base, bytesCurados, { eventTitle: 'X', code: 'DEM0CF2026' }),
    ).rejects.toThrow(/página/)
  })
})

/** Um base.pdf de uns 3 MB: imagem de ruído, que não comprime. */
async function basePdfPesado(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const pagina = doc.addPage([841.89, 595.28])
  const imagem = await doc.embedPng(artePng(1024, 1000, { ruido: true }))
  pagina.drawImage(imagem, { x: 0, y: 0, width: 841.89, height: 595.28 })
  return doc.save()
}
