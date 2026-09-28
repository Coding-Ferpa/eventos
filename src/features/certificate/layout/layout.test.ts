// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadFont, type FontMetrics } from '../fonts/metrics'
import type { TemplateSnapshot, TextField } from '../schema'
import type { TokenContext } from '../tokens'
import { layout, type FontResolver, type TextItem } from './layout'

const CONTEXTO: TokenContext = {
  siteUrl: 'https://eventos.codingferpa.org',
  participant: { fullName: 'Ana Lima', cpfLast3: null },
  event: {
    title: 'Ferpa Tech Day 2026',
    locationName: null,
    city: 'Fernandópolis',
    startsAt: new Date('2026-09-12T11:00:00Z'),
    endsAt: null,
  },
  participation: { label: 'Participante' },
  certificate: {
    hours: 8,
    code: 'DEM0CF2026',
    issuedAt: new Date('2026-09-14T15:00:00Z'),
    sequence: 1,
    data: {},
  },
}

const PAGINA = { width_pt: 841.89, height_pt: 595.28, preview_path: null }

function campoDeTexto(parcial: Partial<TextField> = {}): TextField {
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

function modelo(
  campos: TemplateSnapshot['layout_fields'],
  paginas = [PAGINA],
): TemplateSnapshot {
  return {
    schema_version: 1,
    version: 1,
    base_pdf_path: 'modelo/base.pdf',
    base_pdf_sha256: 'a'.repeat(64),
    base_pdf_size_bytes: 1,
    pages: paginas,
    data_fields: [
      {
        key: 'titulo_palestra',
        label: 'Título da palestra',
        type: 'text',
        required: false,
        default: null,
        format: { type: 'text', max_length: 300 },
      },
    ],
    layout_fields: campos,
  }
}

/** Métrica de mentira: 0,5 em por caractere, ascent 800 e descent -200 em 1000. */
function mono(faltando = ''): FontMetrics {
  return {
    font: null as never,
    unitsPerEm: 1000,
    ascent: 800,
    descent: -200,
    widthAt: (texto, tamanho) => texto.length * 0.5 * tamanho,
    missingCharacters: (texto) => [...new Set(texto)].filter((c) => faltando.includes(c)),
    glyphs: () => [],
  }
}

const monoResolver: FontResolver = () => ({ metrics: mono(), weight: 600 })

const POPPINS: Record<string, FontMetrics> = Object.fromEntries(
  ['Regular:400', 'SemiBold:600', 'Bold:700'].map((par) => {
    const [nome, peso] = par.split(':') as [string, string]
    const bytes = new Uint8Array(
      readFileSync(path.resolve(`public/fonts/cert/Poppins-${nome}.ttf`)),
    )
    return [`curated:poppins-${peso}`, loadFont(bytes)]
  }),
)
const poppins: FontResolver = (ref) => ({
  metrics: POPPINS[ref]!,
  weight: Number(ref.split('-').pop()),
})

function textoDe(plano: ReturnType<typeof layout>, pagina = 0): TextItem {
  return plano.pages[pagina]!.items.find((item) => item.kind === 'text') as TextItem
}

describe('layout: posição', () => {
  // Caixa de 100 × 40 pt em (10, 20); texto "ab" a 20 pt mede 20 pt de largura.
  const caixa = { x: 10 / 841.89, y: 20 / 595.28, w: 100 / 841.89, h: 40 / 595.28 }
  const alinhado = (h: TextField['h_align'], v: TextField['v_align']) =>
    textoDe(
      layout(
        modelo([
          campoDeTexto({
            box: caixa,
            content: 'ab',
            size_pt: 20,
            min_size_pt: 6,
            line_height: 1,
            h_align: h,
            v_align: v,
          }),
        ]),
        CONTEXTO,
        monoResolver,
      ),
    ).lines[0]!

  it.each([
    ['left', 10],
    ['center', 50],
    ['right', 90],
  ] as const)('horizontal %s', (h, x) => {
    expect(alinhado(h, 'top').xPt).toBeCloseTo(x, 2)
  })

  // Linha de base: topo da linha + ascent × s / upem, com a linha do tamanho
  // exato do corpo (line_height 1, ascent - descent = upem).
  it.each([
    ['top', 20 + 16],
    ['middle', 20 + 10 + 16],
    ['bottom', 20 + 20 + 16],
  ] as const)('vertical %s', (v, linhaDeBase) => {
    expect(alinhado('left', v).baselineYPt).toBeCloseTo(linhaDeBase, 2)
  })

  it('o plano é arredondado a 0,01 pt', () => {
    const linha = alinhado('center', 'middle')
    for (const valor of [linha.xPt, linha.baselineYPt, linha.widthPt]) {
      expect(Math.round(valor * 100) / 100).toBe(valor)
    }
  })
})

describe('layout: conteúdo e avisos', () => {
  it('resolve os placeholders e aplica a transformação', () => {
    const plano = layout(
      modelo([
        campoDeTexto({
          transform: 'uppercase',
          content: 'Olá, {{participant.full_name}}',
        }),
      ]),
      CONTEXTO,
      monoResolver,
    )
    expect(textoDe(plano).lines.map((linha) => linha.text)).toEqual(['OLÁ, ANA LIMA'])
  })

  it('campo que resolve em texto vazio não entra no plano', () => {
    const plano = layout(
      modelo([campoDeTexto({ content: '{{data.titulo_palestra}}' })]),
      CONTEXTO,
      monoResolver,
    )
    expect(plano.pages[0]!.items).toEqual([])
  })

  it('glifo ausente: o campo inteiro vai para a fonte de reserva, com aviso', () => {
    const semCedilha: FontResolver = (ref) =>
      ref === 'custom:0b4ed4e6-2a4c-4f7e-9d71-1f5e2d3c4b5a'
        ? { metrics: mono('ç'), weight: 700 }
        : { metrics: mono(), weight: 700 }
    const plano = layout(
      modelo([campoDeTexto({ font: 'custom:0b4ed4e6-2a4c-4f7e-9d71-1f5e2d3c4b5a' })]),
      { ...CONTEXTO, participant: { ...CONTEXTO.participant, fullName: 'Conceição' } },
      semCedilha,
    )

    expect(textoDe(plano).font).toBe('curated:poppins-700')
    expect(plano.warnings).toEqual([
      { fieldId: 'nome', code: 'GLYPH_FALLBACK', detail: expect.stringContaining('ç') },
    ])
  })

  it('texto abaixo do mínimo avisa com o tamanho final', () => {
    const plano = layout(
      modelo([
        campoDeTexto({
          box: { x: 0.1, y: 0.4, w: 0.1, h: 0.05 },
          max_lines: 1,
          content: 'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues',
        }),
      ]),
      CONTEXTO,
      monoResolver,
    )
    expect(plano.warnings.map((aviso) => aviso.code)).toEqual(['BELOW_MIN_SIZE'])
  })

  it('QR: maior quadrado centrado na caixa, com a URL de validação', () => {
    const plano = layout(
      modelo([
        {
          id: 'qr',
          kind: 'qr',
          page: 1,
          box: { x: 0.8, y: 0.7, w: 0.15, h: 0.25 },
          dark: '#000000',
          light: '#FFFFFF',
        },
      ]),
      CONTEXTO,
      monoResolver,
    )
    const qr = plano.pages[0]!.items[0]!
    expect(qr).toMatchObject({ kind: 'qr', modules: 41, sizePt: 126.28 })
    if (qr.kind !== 'qr') return
    expect(qr.yPt).toBeCloseTo(0.7 * 595.28 + (0.25 * 595.28 - 126.28) / 2, 1)
    expect(plano.warnings).toEqual([])
  })

  it('QR menor que 2 cm avisa', () => {
    const plano = layout(
      modelo([
        {
          id: 'qr',
          kind: 'qr',
          page: 1,
          box: { x: 0.9, y: 0.9, w: 0.05, h: 0.05 },
          dark: '#000000',
          light: null,
        },
      ]),
      CONTEXTO,
      monoResolver,
    )
    expect(plano.warnings.map((aviso) => aviso.code)).toEqual(['QR_TOO_SMALL'])
  })

  // PDF-08 do doc 05.
  it('duas páginas: cada campo na sua, com a página canônica de cada uma', () => {
    const verso = { width_pt: 595.28, height_pt: 841.89, preview_path: null }
    const plano = layout(
      modelo(
        [
          campoDeTexto(),
          {
            id: 'qr',
            kind: 'qr',
            page: 2,
            box: { x: 0.4, y: 0.8, w: 0.2, h: 0.15 },
            dark: '#000000',
            light: '#FFFFFF',
          },
          campoDeTexto({ id: 'horas', page: 2, content: '{{certificate.hours_long}}' }),
        ],
        [PAGINA, verso],
      ),
      CONTEXTO,
      monoResolver,
    )
    expect(plano.pages.map((pagina) => [pagina.widthPt, pagina.heightPt])).toEqual([
      [841.89, 595.28],
      [595.28, 841.89],
    ])
    expect(plano.pages[1]!.items.map((item) => item.fieldId)).toEqual(['qr', 'horas'])
  })
})

describe('layout: snapshots com a Poppins', () => {
  // PDF-02 do doc 05.
  it('nome longo em caixa de nome típica: cabe, e nenhuma linha passa da caixa', () => {
    const campo = campoDeTexto()
    const plano = layout(
      modelo([campo]),
      {
        ...CONTEXTO,
        participant: {
          ...CONTEXTO.participant,
          fullName: 'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues',
        },
      },
      poppins,
    )

    const item = textoDe(plano)
    const x0 = campo.box.x * 841.89
    for (const linha of item.lines) {
      expect(linha.xPt).toBeGreaterThanOrEqual(x0 - 0.01)
      expect(linha.xPt + linha.widthPt).toBeLessThanOrEqual(
        x0 + campo.box.w * 841.89 + 0.01,
      )
    }
    expect(plano.warnings).toEqual([])
    expect(plano).toMatchSnapshot()
  })

  // PDF-03 do doc 05.
  it('nome curto: tamanho nominal, uma linha', () => {
    const item = textoDe(layout(modelo([campoDeTexto()]), CONTEXTO, poppins))
    expect(item.sizePt).toBe(32)
    expect(item.lines).toHaveLength(1)
  })

  // PDF-17 do doc 05.
  it('parágrafo wrap_then_shrink com título de palestra longo', () => {
    const plano = layout(
      modelo([
        campoDeTexto({
          id: 'paragrafo',
          font: 'curated:poppins-400',
          box: { x: 0.1, y: 0.55, w: 0.8, h: 0.15 },
          size_pt: 16,
          min_size_pt: 10,
          max_lines: 4,
          h_align: 'left',
          v_align: 'top',
          fit: 'wrap_then_shrink',
          content:
            'participou como {{participation.label}} com a palestra {{data.titulo_palestra}}, com carga horária de {{certificate.hours_long}}.',
        }),
      ]),
      {
        ...CONTEXTO,
        certificate: {
          ...CONTEXTO.certificate,
          data: {
            titulo_palestra:
              'Introdução ao versionamento distribuído com Git e GitHub: ramificações, revisão de código e integração contínua na prática',
          },
        },
      },
      poppins,
    )
    expect(textoDe(plano).lines.length).toBeLessThanOrEqual(4)
    expect(plano).toMatchSnapshot()
  })
})
