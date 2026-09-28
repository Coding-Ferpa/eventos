// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { artes } from '../../../tests/support/artes'
import {
  bytesDaFonte,
  extrairTexto,
  ttfsDaPasta,
} from '../../../tests/support/certificado'
import { buildBasePdf } from './base-pdf'
import { loadFont } from './fonts/metrics'
import { generateCertificatePdf } from './index'
import type { TemplateSnapshot } from './schema'

/**
 * Gate inegociável do CI (docs 11 e 12): `pnpm test:gate:pdf`. Para cada TTF
 * de `public/fonts/cert/`, o nome acentuado passa pelo motor inteiro e volta
 * idêntico do PDF. A pasta é listada, então fonte nova entra sozinha.
 *
 * O nome tem só letras que o WinAnsi também tem: uma regressão para
 * `StandardFonts` passaria pela extração. Por isso o gate também exige a
 * fonte embutida e nenhuma das 14 fontes-padrão.
 */

const NOME = 'José Gonçalves de Assunção'

describe('gate: acentos no PDF', () => {
  it('a pasta de fontes curadas não está vazia', () => {
    expect(ttfsDaPasta().length).toBeGreaterThanOrEqual(3)
  })

  it.each(ttfsDaPasta())('%s: o nome volta idêntico do PDF', async (arquivo) => {
    const ref = `gate:${arquivo}`
    const base = await buildBasePdf([await artes.a4Paisagem()])
    const snapshot: TemplateSnapshot = {
      schema_version: 1,
      version: 1,
      base_pdf_path: 'modelo/base.pdf',
      base_pdf_sha256: base.sha256,
      base_pdf_size_bytes: base.bytes.byteLength,
      pages: base.pages.map((pagina) => ({ ...pagina, preview_path: null })),
      data_fields: [],
      layout_fields: [
        {
          id: 'nome',
          kind: 'text',
          page: 1,
          box: { x: 0.1, y: 0.4, w: 0.8, h: 0.12 },
          content: '{{participant.full_name}}',
          font: ref,
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
      ],
    }

    const { pdf, warnings } = await generateCertificatePdf({
      snapshot,
      context: {
        siteUrl: 'https://eventos.codingferpa.org',
        participant: { fullName: NOME, cpfLast3: null },
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
          issuedAt: null,
          sequence: 1,
          data: {},
        },
      },
      basePdf: base.bytes,
      // Só a fonte do arquivo: nenhuma reserva pode mascarar glifo faltando.
      fonts: (pedida) => {
        if (pedida !== ref) throw new Error(`O gate pediu outra fonte: ${pedida}`)
        return { metrics: loadFont(bytesDaFonte(arquivo)), weight: 400 }
      },
      fontBytes: () => ({ bytes: bytesDaFonte(arquivo), subset: true }),
    })

    expect(warnings).toEqual([])
    const [pagina] = await extrairTexto(pdf)
    expect(pagina!.map((trecho) => trecho.text).join('')).toBe(NOME)

    const bruto = Buffer.from(pdf).toString('latin1')
    expect(bruto).toContain('/FontFile2')
    expect(bruto).not.toMatch(
      /\/BaseFont\s*\/(Helvetica|Times|Courier|Symbol|ZapfDingbats)/,
    )
  })
})
