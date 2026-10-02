import { describe, expect, it } from 'vitest'

import { parseCpfCell } from './cpf'

describe('parseCpfCell', () => {
  it.each([
    ['529.982.247-25', '52998224725'],
    ['52998224725', '52998224725'],
    [' 529 982 247 25 ', '52998224725'],
    ['529982247/25', '52998224725'],
  ])('%j vira %s', (celula, cpf) => {
    expect(parseCpfCell(celula)).toEqual({ ok: true, cpf })
  })

  it('9 e 10 dígitos ganham os zeros que o Excel comeu', () => {
    expect(parseCpfCell('123456797')).toEqual({ ok: true, cpf: '00123456797' })
    expect(parseCpfCell('1234567890')).toEqual({ ok: true, cpf: '01234567890' })
  })

  it('vazio é "sem CPF", não erro', () => {
    expect(parseCpfCell('')).toEqual({ ok: true, cpf: null })
    expect(parseCpfCell('   ')).toEqual({ ok: true, cpf: null })
  })

  it.each(['1,23457E+10', '1.23457E+10', '5,29982E+10', '1,23457e10'])(
    '%j é notação científica, irrecuperável',
    (celula) => {
      expect(parseCpfCell(celula)).toEqual({ ok: false, code: 'CPF_SCIENTIFIC_NOTATION' })
    },
  )

  it('sequência repetida tem código próprio', () => {
    expect(parseCpfCell('111.111.111-11')).toEqual({
      ok: false,
      code: 'CPF_REPEATED_DIGITS',
    })
  })

  it.each([
    ['529.982.247-24', 'verificador errado'],
    ['12345678', 'oito dígitos: zero à esquerda não explica'],
    ['529982247250', 'doze dígitos'],
    ['não tem', 'texto sem dígito'],
    ['CPF 529.982.247-25 (titular)', 'texto em volta: não adivinhamos'],
  ])('%j é CPF_INVALID (%s)', (celula) => {
    expect(parseCpfCell(celula)).toEqual({ ok: false, code: 'CPF_INVALID' })
  })
})
