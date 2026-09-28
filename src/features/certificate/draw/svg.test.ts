import { gzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { fontesCuradas } from '../../../../tests/support/certificado'
import { layout, type QrItem, type TextItem } from '../layout/layout'
import type { QrField, TemplateSnapshot, TextField } from '../schema'
import type { TokenContext } from '../tokens'
import { drawSvg } from './svg'

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

const QR: QrField = {
  id: 'qr',
  kind: 'qr',
  page: 1,
  box: { x: 0.85, y: 0.75, w: 0.12, h: 0.2 },
  dark: '#1E1E1E',
  light: '#FFFFFF',
}

const PARAGRAFO = campo({
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
    'participou do {{event.title}}, em {{event.city}}, como {{participation.label}}, com carga horária de {{certificate.hours_long}}, na trilha de versionamento distribuído e integração contínua.',
})

function plano(campos: TemplateSnapshot['layout_fields'], nome = 'José Gonçalves') {
  return layout(
    {
      schema_version: 1,
      version: 1,
      base_pdf_path: 'modelo/base.pdf',
      base_pdf_sha256: 'a'.repeat(64),
      base_pdf_size_bytes: 1,
      pages: [PAGINA],
      data_fields: [],
      layout_fields: campos,
    },
    contexto(nome),
    fontesCuradas,
  )
}

function desenhar(
  campos: TemplateSnapshot['layout_fields'],
  opcoes: { backgroundUrl?: string | null; label?: string; nome?: string } = {},
) {
  const resultado = plano(campos, opcoes.nome)
  const svg = drawSvg(resultado.pages[0]!, fontesCuradas, {
    backgroundUrl: opcoes.backgroundUrl ?? null,
    label: opcoes.label ?? 'Prévia do certificado de José Gonçalves',
  })
  const documento = new DOMParser().parseFromString(svg, 'image/svg+xml')
  expect(documento.querySelector('parsererror')).toBeNull()
  return { plano: resultado, svg, raiz: documento.documentElement }
}

/** `translate(x y) scale(a b)` → números; o teste lê o que o navegador leria. */
function transformacao(g: Element) {
  const texto = g.getAttribute('transform') ?? ''
  const casado =
    /^translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)(?: ([-\d.]+))?\)$/.exec(texto)
  if (!casado) throw new Error(`transform inesperado: ${texto}`)
  const [, x, y, sx, sy] = casado.map(Number)
  return { x: x!, y: y!, sx: sx!, sy: Number.isNaN(sy) ? sx! : sy! }
}

describe('drawSvg', () => {
  // PDF-10 do doc 05: os grupos de glifos repetem os números do plano.
  it('cada linha fica na posição, linha de base e tamanho do plano, espelhada no y', () => {
    const campos: TextField[] = [PARAGRAFO]
    for (const [i, h] of (['left', 'center', 'right'] as const).entries()) {
      for (const [j, v] of (['top', 'middle', 'bottom'] as const).entries()) {
        campos.push(
          campo({
            id: `${h}-${v}`,
            content: `Alinhado ${h} ${v}`,
            box: { x: 0.05 + i * 0.31, y: 0.05 + j * 0.1, w: 0.28, h: 0.08 },
            size_pt: 14,
            min_size_pt: 8,
            h_align: h,
            v_align: v,
          }),
        )
      }
    }
    const { plano, raiz } = desenhar(campos)
    const itens = plano.pages[0]!.items as TextItem[]
    expect(
      itens.find((item) => item.fieldId === 'paragrafo')!.lines.length,
    ).toBeGreaterThan(1)

    for (const item of itens) {
      const unidades = fontesCuradas(item.font).metrics.unitsPerEm
      const grupo = raiz.querySelector(`g[data-field="${item.fieldId}"]`)!
      expect(grupo.getAttribute('fill')).toBe(item.color)
      const linhas = [...grupo.children]
      expect(linhas).toHaveLength(item.lines.length)

      for (const [i, linha] of item.lines.entries()) {
        const t = transformacao(linhas[i]!)
        expect(t.x).toBeCloseTo(linha.xPt, 2)
        expect(t.y).toBeCloseTo(linha.baselineYPt, 2)
        expect(t.sx * unidades).toBeCloseTo(item.sizePt, 2)
        expect(t.sy).toBe(-t.sx)

        // O último glifo termina onde o plano diz que a linha termina.
        const usos = [...linhas[i]!.querySelectorAll('use')]
        const ultimo = usos.at(-1)!
        const avancoFinal = fontesCuradas(item.font)
          .metrics.glyphs(linha.text)
          .at(-1)!.advance
        const fim = (Number(ultimo.getAttribute('x') ?? 0) + avancoFinal) * t.sx
        expect(fim).toBeCloseTo(linha.widthPt, 1)
      }
    }
  })

  it('cada glifo é desenhado uma vez em defs e reusado, sem id repetido', () => {
    const { plano, raiz } = desenhar([PARAGRAFO])
    const linhas = (plano.pages[0]!.items[0] as TextItem).lines
    const metricas = fontesCuradas('curated:poppins-400').metrics
    const unicos = new Set(
      linhas.flatMap((linha) => metricas.glyphs(linha.text)).map((g) => g.id),
    )

    const definidos = [...raiz.querySelectorAll('defs > path')].map((p) => p.id)
    expect(definidos).toHaveLength(unicos.size)
    expect(new Set(definidos).size).toBe(definidos.length)

    const usos = [...raiz.querySelectorAll('use')]
    expect(usos).toHaveLength(
      linhas.reduce((n, linha) => n + metricas.glyphs(linha.text).length, 0),
    )
    for (const uso of usos) {
      expect(definidos).toContain(uso.getAttribute('href')!.slice(1))
    }
  })

  it('o id do glifo nasce da fonte e do glifo: duas prévias na página não trocam letras', () => {
    const regular = desenhar([campo({ font: 'curated:poppins-400', content: 'a' })]).raiz
    const negrito = desenhar([campo({ font: 'curated:poppins-700', content: 'a' })]).raiz
    const idDe = (raiz: Element) => raiz.querySelector('defs > path')!.id

    expect(idDe(regular)).not.toBe(idDe(negrito))
    expect(idDe(regular)).toBe(
      idDe(desenhar([campo({ font: 'curated:poppins-400', content: 'aa' })]).raiz),
    )
  })

  it('QR: o mesmo path do plano, na escala do plano, com o fundo claro', () => {
    const { plano, raiz } = desenhar([QR])
    const qr = plano.pages[0]!.items[0] as QrItem
    const grupo = raiz.querySelector('g[data-field="qr"]')!
    const t = transformacao(grupo)

    expect(t.x).toBeCloseTo(qr.xPt, 2)
    expect(t.y).toBeCloseTo(qr.yPt, 2)
    expect(t.sx * qr.modules).toBeCloseTo(qr.sizePt, 2)
    expect(t.sy).toBe(t.sx)
    expect(grupo.querySelector('rect')!.getAttribute('fill')).toBe('#FFFFFF')
    expect(grupo.querySelector('path')!.getAttribute('d')).toBe(qr.path)
    expect(grupo.querySelector('path')!.getAttribute('fill')).toBe('#1E1E1E')
  })

  it('QR sem cor clara não pinta fundo', () => {
    const { raiz } = desenhar([{ ...QR, light: null }])
    expect(raiz.querySelector('g[data-field="qr"] rect')).toBeNull()
  })

  it('a raiz tem viewBox em pt, papel de imagem e o rótulo acessível', () => {
    const { raiz } = desenhar([campo()])
    expect(raiz.getAttribute('viewBox')).toBe('0 0 841.89 595.28')
    expect(raiz.getAttribute('role')).toBe('img')
    expect(raiz.getAttribute('aria-label')).toBe(
      'Prévia do certificado de José Gonçalves',
    )
  })

  it('o fundo é a imagem da prévia na página inteira, ou branco enquanto não há', () => {
    const comFundo = desenhar([campo()], { backgroundUrl: '/previews/a.webp' }).raiz
    const imagem = comFundo.querySelector('image')!
    expect(imagem.getAttribute('href')).toBe('/previews/a.webp')
    expect([imagem.getAttribute('width'), imagem.getAttribute('height')]).toEqual([
      '841.89',
      '595.28',
    ])

    const semFundo = desenhar([campo()]).raiz
    expect(semFundo.querySelector('image')).toBeNull()
    expect(semFundo.querySelector(':scope > rect')!.getAttribute('fill')).toBe('#FFFFFF')
  })

  // O SVG vai inline na tela de retirada, com o nome do participante no
  // rótulo: sem escape, um nome vira marcação.
  it('nome e URL com aspas e sinais de menor não viram marcação', () => {
    const malicioso = 'Ana "><script>alert(1)</script> & <b>Lima</b>'
    const url = '/previews/a.webp"><script>alert(2)</script>'
    const { raiz } = desenhar([campo()], { label: malicioso, backgroundUrl: url })

    expect(raiz.querySelectorAll('script, b')).toHaveLength(0)
    expect(raiz.getAttribute('aria-label')).toBe(malicioso)
    expect(raiz.querySelector('image')!.getAttribute('href')).toBe(url)
  })

  // Medido no M5: 33,5 KB crus e 8,4 KB comprimidos, que é o que o celular
  // baixa na tela de retirada. O teto é a medida com uma folga pequena.
  it('o certificado típico (nome, parágrafo e QR) fica em poucos KB comprimido', () => {
    const { svg } = desenhar([campo(), PARAGRAFO, QR], {
      nome: 'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues',
    })
    expect(gzipSync(svg).byteLength).toBeLessThan(10 * 1024)
  })
})
