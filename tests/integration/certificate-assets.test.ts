import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildBasePdf, type BasePdf } from '@/features/certificate/base-pdf'
import { generateCertificatePdf } from '@/features/certificate/index'
import type { TemplateSnapshot } from '@/features/certificate/schema'
import { certificateAssets } from '@/lib/certificate-assets'
import { supabaseAdmin } from '@/lib/supabase/admin'

import { artes } from '../support/artes'
import { extrairTexto } from '../support/certificado'

/**
 * O caminho de servidor do motor com o Storage de verdade: base.pdf no bucket
 * privado `templates`, baixado pela chave de serviço e conferido pelo sha256,
 * fontes lidas do disco. É o que a rota de download do M8 vai chamar.
 */

let base: BasePdf
let caminho: string

beforeAll(async () => {
  base = await buildBasePdf([await artes.a4Paisagem()])
  caminho = `teste-integracao/${base.sha256}.pdf`
  const { error } = await supabaseAdmin()
    .storage.from('templates')
    .upload(caminho, base.bytes, { contentType: 'application/pdf', upsert: true })
  if (error) throw error
})

afterAll(async () => {
  await supabaseAdmin().storage.from('templates').remove([caminho])
})

describe('certificateAssets contra o Storage local', () => {
  it('baixa o base.pdf do bucket privado e confere o sha256', async () => {
    const bytes = await certificateAssets.basePdf({
      base_pdf_path: caminho,
      base_pdf_sha256: base.sha256,
    })
    expect(Buffer.from(bytes).equals(Buffer.from(base.bytes))).toBe(true)
  })

  it('caminho que não existe falha com o motivo, e não com bytes vazios', async () => {
    await expect(
      certificateAssets.basePdf({
        base_pdf_path: 'nao-existe/base.pdf',
        base_pdf_sha256: 'f'.repeat(64),
      }),
    ).rejects.toThrow(/Download do base.pdf falhou/)
  })

  it('gera o PDF com acentos pelo caminho de servidor inteiro', async () => {
    const snapshot: TemplateSnapshot = {
      schema_version: 1,
      version: 1,
      base_pdf_path: caminho,
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
      ],
    }

    const [basePdf, { fonts, fontBytes }] = await Promise.all([
      certificateAssets.basePdf(snapshot),
      certificateAssets.fonts(snapshot),
    ])
    const { pdf } = await generateCertificatePdf({
      snapshot,
      context: {
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
        certificate: {
          hours: 8,
          code: 'DEM0CF2026',
          issuedAt: null,
          sequence: 1,
          data: {},
        },
      },
      basePdf,
      fonts,
      fontBytes,
    })

    const [pagina] = await extrairTexto(pdf)
    expect(pagina!.map((trecho) => trecho.text).join('')).toBe(
      'José Gonçalves de Assunção',
    )
  })
})
