import { describe, expect, it } from 'vitest'

import { isRepeatedDigits, isValidCpf } from './cpf'

describe('isValidCpf', () => {
  it.each(['52998224725', '11144477735', '00123456797'])('%s é válido', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true)
  })

  it.each([
    ['52998224724', 'segundo verificador errado'],
    ['52998224715', 'primeiro verificador errado'],
    ['5299822472', 'dez dígitos'],
    ['529982247250', 'doze dígitos'],
    ['529.982.247-25', 'com máscara: a função recebe só dígitos'],
    ['11111111111', 'sequência repetida, que passa na conta'],
    ['00000000000', 'zeros'],
  ])('%s não é (%s)', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false)
  })
})

describe('isRepeatedDigits', () => {
  it('pega todas as dez sequências e nada além delas', () => {
    for (let d = 0; d <= 9; d++) expect(isRepeatedDigits(String(d).repeat(11))).toBe(true)
    expect(isRepeatedDigits('11111111112')).toBe(false)
  })
})
