// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { artes } from '../../../tests/support/artes'
import {
  bytesCurados,
  extrairTexto,
  fontesCuradas,
} from '../../../tests/support/certificado'
import { buildBasePdf } from './base-pdf'
import { generateCertificatePdf, renderCertificateSvg } from './index'
import type { TemplateSnapshot, TextField } from './schema'
import type { TokenContext } from './tokens'

const CONTEXTO: TokenContext = {
  siteUrl: 'https://eventos.codingferpa.org',
  participant: { fullName: 'José Gonçalves de Assunção', cpfLast3: null },
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

function texto(parcial: Partial<TextField>): TextField {
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

async function frenteEVerso() {
  const base = await buildBasePdf([await artes.duasPaginas()])
  const snapshot: TemplateSnapshot = {
    schema_version: 1,
    version: 1,
    base_pdf_sha256: base.sha256,
    pages: base.pages.map((pagina) => ({ ...pagina, preview_path: null })),
    data_fields: [],
    layout_fields: [
      texto({}),
      texto({
        id: 'codigo',
        page: 2,
        box: { x: 0.1, y: 0.1, w: 0.8, h: 0.05 },
        content: 'Código {{certificate.code}}',
        font: 'curated:poppins-400',
        size_pt: 12,
        min_size_pt: 8,
      }),
      {
        id: 'qr',
        kind: 'qr',
        page: 2,
        box: { x: 0.4, y: 0.8, w: 0.2, h: 0.15 },
        dark: '#000000',
        light: '#FFFFFF',
      },
    ],
  }
  return { base, snapshot }
}

describe('generateCertificatePdf', () => {
  // PDF-08 do doc 05, de ponta a ponta: arte, base.pdf, motor, texto extraído.
  it('frente e verso: cada texto na sua página, com os acentos intactos', async () => {
    const { base, snapshot } = await frenteEVerso()
    const { pdf, warnings } = await generateCertificatePdf({
      snapshot,
      context: CONTEXTO,
      basePdf: base.bytes,
      fonts: fontesCuradas,
      fontBytes: bytesCurados,
    })

    const [frente, verso] = await extrairTexto(pdf)
    expect(frente!.map((t) => t.text).join('')).toBe('José Gonçalves de Assunção')
    expect(verso!.map((t) => t.text).join('')).toBe('Código DEM0-CF2-026')
    expect(warnings).toEqual([])
  })

  it('devolve os avisos do layout', async () => {
    const { base, snapshot } = await frenteEVerso()
    snapshot.layout_fields[0] = texto({ box: { x: 0.45, y: 0.4, w: 0.1, h: 0.03 } })
    const { warnings } = await generateCertificatePdf({
      snapshot,
      context: CONTEXTO,
      basePdf: base.bytes,
      fonts: fontesCuradas,
      fontBytes: bytesCurados,
    })
    expect(warnings.map((aviso) => aviso.code)).toEqual(['BELOW_MIN_SIZE'])
  })
})

describe('renderCertificateSvg', () => {
  it('desenha a página pedida, com o rótulo de frente ou de verso', async () => {
    const { snapshot } = await frenteEVerso()
    const entrada = { snapshot, context: CONTEXTO, fonts: fontesCuradas }

    const frente = renderCertificateSvg({ ...entrada, page: 1, backgroundUrl: null })
    const verso = renderCertificateSvg({ ...entrada, page: 2, backgroundUrl: '/v.webp' })

    expect(frente.svg).toContain(
      'aria-label="Prévia do certificado de José Gonçalves de Assunção"',
    )
    expect(frente.svg).toContain('data-field="nome"')
    expect(frente.svg).not.toContain('data-field="qr"')
    expect(verso.svg).toContain(
      'aria-label="Verso do certificado de José Gonçalves de Assunção"',
    )
    expect(verso.svg).toContain('viewBox="0 0 595.28 841.89"')
    expect(verso.svg).toContain('data-field="qr"')
  })

  it('recusa página que o modelo não tem', async () => {
    const { snapshot } = await frenteEVerso()
    expect(() =>
      renderCertificateSvg({
        snapshot,
        context: CONTEXTO,
        fonts: fontesCuradas,
        page: 3,
        backgroundUrl: null,
      }),
    ).toThrow(/página 3/)
  })
})
