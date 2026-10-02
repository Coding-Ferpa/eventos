import { describe, expect, it } from 'vitest'

import { mascararNaAmostra, parseCpfCell } from './cpf'

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

describe('mascararNaAmostra (a amostra da inspeção vai para o navegador)', () => {
  it.each([
    ['529.982.247-25', '***.***.**7-25'],
    ['52998224725', '***.***.**7-25'],
    [' 529 982 247 25 ', '***.***.**7-25'],
    ['529982247/25', '***.***.**7-25'],
    // O Excel come o zero inicial: 9 e 10 dígitos também são CPF (doc 06).
    ['12345678', '12345678'],
    ['123456789', '***.***.**7-89'],
    // Dígito errado continua sendo dado de alguém.
    ['529.982.247-24', '***.***.**7-24'],
    // Dígito a mais também: é o CPF de alguém com um erro de digitação.
    ['529.982.247-251', '***.***.**2-51'],
  ])('%j vira %j', (celula, saida) => {
    expect(mascararNaAmostra(celula)).toBe(saida)
  })

  it('não mexe no que não tem forma de CPF', () => {
    for (const celula of [
      'José Gonçalves de Assunção',
      'jose@example.com',
      '8',
      '12/03/2004',
      '5,29982E+10',
      // A notação científica do Excel fica à vista: é ela que o admin precisa
      // ver para entender o erro, e não dá para recuperar o CPF dela.
      '5,29982247E+10',
      '',
    ]) {
      expect(mascararNaAmostra(celula)).toBe(celula)
    }
  })
})
