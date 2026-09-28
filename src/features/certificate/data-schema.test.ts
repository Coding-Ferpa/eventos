import { describe, expect, it } from 'vitest'

import { buildDataSchema, dataIssueCode, parseDate, parseHours } from './data-schema'
import type { DataField } from './schema'

function campo(
  parcial: Partial<DataField> & Pick<DataField, 'key' | 'type' | 'format'>,
): DataField {
  return { label: parcial.key, required: false, default: null, ...parcial } as DataField
}

const TITULO = campo({
  key: 'titulo_palestra',
  label: 'Título da palestra',
  type: 'text',
  required: true,
  format: { type: 'text', max_length: 20 },
})
const TURMA = campo({
  key: 'turma',
  type: 'text',
  default: 'Geral',
  format: { type: 'text', max_length: 40 },
})
const NOTA = campo({
  key: 'nota',
  type: 'number',
  format: { type: 'number', decimals: 1 },
})
const DATA = campo({
  key: 'data_defesa',
  type: 'date',
  format: { type: 'date', style: 'long' },
})
const HORAS = campo({
  key: 'horas_extra',
  type: 'hours',
  format: { type: 'hours', style: 'long' },
})

function codigos(fields: DataField[], entrada: Record<string, unknown>) {
  const resultado = buildDataSchema(fields).safeParse(entrada)
  return resultado.success
    ? []
    : resultado.error.issues.map((issue) => dataIssueCode(issue))
}

describe('buildDataSchema', () => {
  it('normaliza cada tipo para o que vai em certificates.data', () => {
    const dados = buildDataSchema([TITULO, NOTA, DATA, HORAS]).parse({
      titulo_palestra: '  Git na prática ',
      nota: '9,5',
      data_defesa: '12/09/2026',
      horas_extra: '1,5 hora',
    })

    expect(dados).toEqual({
      titulo_palestra: 'Git na prática',
      nota: 9.5,
      data_defesa: '2026-09-12',
      horas_extra: 1.5,
    })
  })

  it('campo obrigatório vazio é FIELD_REQUIRED', () => {
    expect(codigos([TITULO], { titulo_palestra: '   ' })).toEqual(['FIELD_REQUIRED'])
    expect(codigos([TITULO], {})).toEqual(['FIELD_REQUIRED'])
  })

  it('vazio usa o padrão do modelo; sem padrão e opcional, fica de fora', () => {
    expect(buildDataSchema([TURMA, NOTA]).parse({ turma: '', nota: '' })).toEqual({
      turma: 'Geral',
    })
  })

  it('texto acima do limite é FIELD_TOO_LONG', () => {
    expect(codigos([TITULO], { titulo_palestra: 'x'.repeat(21) })).toEqual([
      'FIELD_TOO_LONG',
    ])
  })

  it('valor com cara de CPF é recusado em qualquer campo (segunda barreira)', () => {
    expect(codigos([TITULO], { titulo_palestra: '529.982.247-25' })).toEqual([
      'CONTENT_LOOKS_LIKE_CPF',
    ])
    expect(codigos([NOTA], { nota: '52998224725' })).toEqual(['CONTENT_LOOKS_LIKE_CPF'])
  })

  it('tipo que não confere é FIELD_INVALID', () => {
    expect(codigos([NOTA], { nota: 'nove' })).toEqual(['FIELD_INVALID'])
    expect(codigos([NOTA], { nota: '9,55' })).toEqual(['FIELD_INVALID'])
    expect(codigos([DATA], { data_defesa: '12/09/26' })).toEqual(['FIELD_INVALID'])
    expect(codigos([HORAS], { horas_extra: '-2' })).toEqual(['FIELD_INVALID'])
  })

  it('chave que o modelo não declara não entra no payload', () => {
    expect(buildDataSchema([TURMA]).parse({ turma: 'A', cpf: '52998224725' })).toEqual({
      turma: 'A',
    })
  })
})

describe('parseDate (formatos do doc 06)', () => {
  it.each([
    ['12/09/2026', '2026-09-12'],
    ['12-09-2026', '2026-09-12'],
    ['12.09.2026', '2026-09-12'],
    ['2026-09-12', '2026-09-12'],
    ['1/2/2026', '2026-02-01'],
    ['46277', '2026-09-12'], // número de série do Excel, base 1899-12-30
  ])('%j → %s', (entrada, esperado) => {
    expect(parseDate(entrada)).toBe(esperado)
  })

  it.each(['12/09/26', '31/02/2026', '2026-13-01', 'amanhã', '9999', '70000'])(
    '%j não é data',
    (entrada) => {
      expect(parseDate(entrada)).toBeNull()
    },
  )
})

describe('parseHours (formatos do doc 06)', () => {
  it.each([
    ['8', 8],
    ['8,5', 8.5],
    ['8.5', 8.5],
    ['8h', 8],
    ['8 horas', 8],
    ['1 hora', 1],
    ['9999,9', 9999.9],
  ])('%j → %d', (entrada, esperado) => {
    expect(parseHours(entrada)).toBe(esperado)
  })

  it.each(['-1', '10000', '8,25', 'oito', ''])('%j não é carga horária', (entrada) => {
    expect(parseHours(entrada)).toBeNull()
  })
})
