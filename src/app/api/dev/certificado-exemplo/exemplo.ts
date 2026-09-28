import { PDFDocument, rgb } from '@cantoo/pdf-lib'

import type { BasePdf } from '@/features/certificate/base-pdf'
import type { TemplateSnapshot, TextField } from '@/features/certificate/schema'
import type { TokenContext } from '@/features/certificate/tokens'

/**
 * Um certificado de exemplo, sem banco nem Storage: a arte é desenhada aqui,
 * e os dados são sintéticos. Serve à rota de desenvolvimento, que prova na
 * Preview da Vercel que as fontes chegam ao pacote da função (doc 05).
 */

const AZUL = rgb(0.11, 0.25, 0.47)

/** Arte vetorial A4 paisagem: moldura dupla e um filete, sem texto. */
export async function arteDeExemplo(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const pagina = doc.addPage([841.89, 595.28])
  pagina.drawRectangle({
    x: 24,
    y: 24,
    width: 841.89 - 48,
    height: 595.28 - 48,
    borderColor: AZUL,
    borderWidth: 4,
  })
  pagina.drawRectangle({
    x: 36,
    y: 36,
    width: 841.89 - 72,
    height: 595.28 - 72,
    borderColor: AZUL,
    borderWidth: 1,
  })
  // Filete abaixo da caixa do nome (y de 0,30 a 0,42 da página), mesmo com
  // o nome em duas linhas.
  pagina.drawLine({
    start: { x: 320, y: 332 },
    end: { x: 521.89, y: 332 },
    thickness: 1,
    color: AZUL,
  })
  return doc.save()
}

function texto(
  parcial: Partial<TextField> & Pick<TextField, 'id' | 'box' | 'content'>,
): TextField {
  return {
    kind: 'text',
    page: 1,
    font: 'curated:poppins-400',
    size_pt: 14,
    min_size_pt: 9,
    color: '#1E1E1E',
    h_align: 'center',
    v_align: 'middle',
    line_height: 1.3,
    max_lines: 1,
    fit: 'shrink_then_wrap',
    transform: 'none',
    ...parcial,
  }
}

export function modeloDeExemplo(base: BasePdf): TemplateSnapshot {
  return {
    schema_version: 1,
    version: 1,
    base_pdf_path: 'exemplo/base.pdf',
    base_pdf_sha256: base.sha256,
    base_pdf_size_bytes: base.bytes.byteLength,
    pages: base.pages.map((pagina) => ({ ...pagina, preview_path: null })),
    data_fields: [],
    layout_fields: [
      texto({
        id: 'titulo',
        box: { x: 0.1, y: 0.12, w: 0.8, h: 0.1 },
        content: 'Certificado',
        font: 'curated:poppins-700',
        size_pt: 36,
        min_size_pt: 24,
        color: '#1C4078',
        transform: 'uppercase',
      }),
      texto({
        id: 'nome',
        box: { x: 0.1, y: 0.3, w: 0.8, h: 0.12 },
        content: '{{participant.full_name}}',
        font: 'curated:poppins-600',
        size_pt: 32,
        min_size_pt: 14,
        max_lines: 2,
        line_height: 1.15,
      }),
      texto({
        id: 'paragrafo',
        box: { x: 0.12, y: 0.47, w: 0.76, h: 0.18 },
        content:
          'participou do {{event.title}}, em {{event.city}}, em {{event.date_long}}, como {{participation.label}}, com carga horária de {{certificate.hours_long}}.',
        max_lines: 3,
        fit: 'wrap_then_shrink',
      }),
      texto({
        id: 'codigo',
        box: { x: 0.08, y: 0.8, w: 0.6, h: 0.05 },
        content:
          'Código de validação {{certificate.code}} · {{certificate.validation_url}}',
        size_pt: 10,
        min_size_pt: 7,
        h_align: 'left',
      }),
      {
        id: 'qr',
        kind: 'qr',
        page: 1,
        box: { x: 0.8, y: 0.72, w: 0.12, h: 0.2 },
        dark: '#1C4078',
        light: '#FFFFFF',
      },
    ],
  }
}

export function contextoDeExemplo(nome: string, siteUrl: string): TokenContext {
  return {
    siteUrl,
    participant: { fullName: nome, cpfLast3: null },
    event: {
      title: 'Ferpa Tech Day 2026',
      locationName: 'Auditório da Fatec',
      city: 'Fernandópolis',
      startsAt: new Date('2026-09-12T11:00:00Z'),
      endsAt: new Date('2026-09-12T20:00:00Z'),
    },
    participation: { label: 'Participante' },
    // Código de demonstração, fora de qualquer banco: não valida nada.
    certificate: { hours: 8, code: 'DEM0CF2026', issuedAt: null, sequence: 1, data: {} },
  }
}
