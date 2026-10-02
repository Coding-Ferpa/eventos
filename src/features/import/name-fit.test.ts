// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadFont } from '@/features/certificate/fonts/metrics'
import type { FontResolver } from '@/features/certificate/layout/layout'
import type { LayoutField, TextField } from '@/features/certificate/schema'

import { nameFields, nameIsBelowMin, type NameLayout } from './name-fit'

const POPPINS = loadFont(
  new Uint8Array(readFileSync(path.resolve('public/fonts/cert/Poppins-SemiBold.ttf'))),
)
const fontes: FontResolver = () => ({ metrics: POPPINS, weight: 600 })

const campo = (
  id: string,
  content: string,
  extra: Partial<TextField> = {},
): TextField => ({
  id,
  kind: 'text',
  page: 1,
  // 0,3 de 841,89 pt: uns 250 pt de largura, uma linha só.
  box: { x: 0.35, y: 0.4, w: 0.3, h: 0.06 },
  content,
  font: 'curated:poppins-600',
  size_pt: 24,
  min_size_pt: 16,
  color: '#1E1E1E',
  h_align: 'center',
  v_align: 'middle',
  line_height: 1.15,
  max_lines: 1,
  fit: 'shrink_then_wrap',
  transform: 'none',
  ...extra,
})

const QR: LayoutField = {
  id: 'qr',
  kind: 'qr',
  page: 1,
  box: { x: 0.85, y: 0.75, w: 0.1, h: 0.15 },
  dark: '#000000',
  light: '#FFFFFF',
}

const modelo = (campos: LayoutField[]): NameLayout => ({
  pages: [{ width_pt: 841.89, height_pt: 595.28, preview_path: null }],
  dataFields: [],
  nameFields: nameFields(campos),
})

const CONTEXTO = {
  siteUrl: 'http://localhost:3000',
  event: {
    title: 'Evento',
    locationName: null,
    city: null,
    startsAt: new Date('2026-09-12T19:00:00Z'),
    endsAt: null,
  },
  participation: { label: 'Participante' },
  certificate: { hours: 8, code: '0000000000', issuedAt: null, sequence: 1, data: {} },
}

describe('nameFields', () => {
  it('só os campos de texto que imprimem o nome', () => {
    const campos = [
      campo('nome', '{{participant.full_name}}'),
      campo('codigo', 'Código {{certificate.code}}'),
      QR,
    ]
    expect(nameFields(campos).map((c) => c.id)).toEqual(['nome'])
  })
})

describe('nameIsBelowMin', () => {
  const caixa = modelo([campo('nome', '{{participant.full_name}}'), QR])

  it('nome comum cabe', () => {
    expect(nameIsBelowMin('Ana Lima', caixa, CONTEXTO, fontes)).toBe(false)
  })

  it('nome muito longo numa caixa de uma linha só cai abaixo do mínimo', () => {
    expect(
      nameIsBelowMin(
        'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues Vasconcelos',
        caixa,
        CONTEXTO,
        fontes,
      ),
    ).toBe(true)
  })

  it('modelo sem campo de nome não mede nada', () => {
    expect(nameIsBelowMin('Qualquer Nome', modelo([QR]), CONTEXTO, fontes)).toBe(false)
  })
})
