import { describe, expect, it } from 'vitest'

import {
  CODE_LENGTH,
  canonicalizeCode,
  diagnoseCode,
  formatCode,
  isValidCode,
  normalizeCode,
} from './code'

// PDF-14 do doc 05: a tabela de entradas que uma pessoa digita de verdade.
describe('normalizeCode (PDF-14)', () => {
  it.each([
    [' abcd-efg hjk ', 'ABCDEFGHJK'],
    ['ABCD-EFG-HJK', 'ABCDEFGHJK'],
    ['abcdefghjk', 'ABCDEFGHJK'],
    ['DEMO-CF2-026', 'DEM0CF2026'], // O vira 0: o sentinela do seed
    ['dem0-cf2-026', 'DEM0CF2026'],
    ['7K2M-9QF-4TX', '7K2M9QF4TX'],
    ['IL00-000-000', '1100000000'], // I e L viram 1
    ['il00 000 000', '1100000000'],
    ['7K2M\t9QF\n4TX', '7K2M9QF4TX'], // qualquer espaço em branco some
  ])('%j → %s', (entrada, esperado) => {
    expect(normalizeCode(entrada)).toBe(esperado)
  })

  it.each([
    ['UUUU-UUU-UUU', 'U não tem mapeamento'],
    ['abcd-efg-hju', 'u minúsculo também não'],
    ['ABCD-EFG-HJ', '9 caracteres'],
    ['ABCD-EFG-HJKM', '11 caracteres'],
    ['', 'vazio'],
    ['ABCD_EFG_HJK', 'sublinhado não é separador'],
    ['ÁBCD-EFG-HJK', 'acento não é do alfabeto'],
  ])('%j é malformado (%s)', (entrada) => {
    expect(normalizeCode(entrada)).toBeNull()
  })
})

describe('isValidCode', () => {
  it('só aceita a forma canônica: 10 símbolos Crockford, maiúsculos, sem hífen', () => {
    expect(isValidCode('ABCDEFGHJK')).toBe(true)
    expect(isValidCode('ABCD-EFG-HJK')).toBe(false)
    expect(isValidCode('abcdefghjk')).toBe(false)
    expect(isValidCode('ABCDEFGHJO')).toBe(false)
  })
})

describe('formatCode', () => {
  it('agrupa como está impresso: XXXX-XXX-XXX', () => {
    expect(formatCode('DEM0CF2026')).toBe('DEM0-CF2-026')
  })

  it('agrupa também o código pela metade, que é o que a máscara do campo mostra', () => {
    expect(formatCode('')).toBe('')
    expect(formatCode('ABC')).toBe('ABC')
    expect(formatCode('ABCD')).toBe('ABCD')
    expect(formatCode('ABCDE')).toBe('ABCD-E')
    expect(formatCode('ABCDEFG')).toBe('ABCD-EFG')
    expect(formatCode('ABCDEFGH')).toBe('ABCD-EFG-H')
  })
})

describe('canonicalizeCode', () => {
  it('aplica os passos 1 a 3 sem validar nada', () => {
    expect(canonicalizeCode(' ab-ol ')).toBe('AB01')
    expect(canonicalizeCode('u*')).toBe('U*')
  })
})

describe('diagnoseCode', () => {
  it('código completo e válido', () => {
    expect(diagnoseCode('dem0-cf2-026')).toEqual({ ok: true, code: 'DEM0CF2026' })
  })

  it('diz quantos caracteres faltam', () => {
    expect(diagnoseCode('ABCD-EFG')).toEqual({ ok: false, reason: 'short', missing: 3 })
  })

  it('diz quantos sobram', () => {
    expect(diagnoseCode('ABCD-EFG-HJKMN')).toEqual({
      ok: false,
      reason: 'long',
      extra: 2,
    })
  })

  it('aponta o primeiro símbolo que não existe, antes de contar', () => {
    // "A letra U não existe" ajuda mais que "faltam 2" quando as duas valem.
    expect(diagnoseCode('ABUD')).toEqual({ ok: false, reason: 'symbol', symbol: 'U' })
  })

  it('o comprimento é o do doc 05', () => {
    expect(CODE_LENGTH).toBe(10)
  })
})
