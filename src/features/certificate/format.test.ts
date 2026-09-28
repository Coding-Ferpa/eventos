import { describe, expect, it } from 'vitest'

import {
  applyTransform,
  formatCpfMasked,
  formatDateLong,
  formatDateShort,
  formatEventDateLong,
  formatEventDateShort,
  formatHours,
  formatNumber,
  formatSequence,
  titleCasePtBr,
} from './format'

// PDF-19 do doc 05 (datas, horas, CPF mascarado, sequência).
describe('horas', () => {
  it.each([
    [8, 'number', '8'],
    [1.5, 'number', '1,5'],
    [8, 'short', '8h'],
    [1.5, 'short', '1,5h'],
    [8, 'long', '8 horas'],
    [1, 'long', '1 hora'],
    [1.5, 'long', '1,5 hora'],
    [2, 'long', '2 horas'],
    [0.5, 'long', '0,5 hora'],
  ] as const)('%d em %s → %s', (horas, estilo, esperado) => {
    expect(formatHours(horas, estilo)).toBe(esperado)
  })
})

describe('números', () => {
  it('vírgula decimal e casas fixas, como o modelo declarou', () => {
    expect(formatNumber(9.5, 1)).toBe('9,5')
    expect(formatNumber(9, 2)).toBe('9,00')
    expect(formatNumber(1234.5, 1)).toBe('1.234,5')
  })
})

describe('datas', () => {
  it('data do conteúdo (aaaa-mm-dd) sai sem virar o dia por causa de fuso', () => {
    expect(formatDateShort('2026-09-01')).toBe('01/09/2026')
    expect(formatDateLong('2026-09-01')).toBe('1 de setembro de 2026')
  })

  it('instante (emissão) é lido em São Paulo', () => {
    // 01h em UTC ainda é o dia anterior em São Paulo.
    expect(formatDateShort(new Date('2026-09-15T01:00:00Z'))).toBe('14/09/2026')
    expect(formatDateLong(new Date('2026-09-15T01:00:00Z'))).toBe(
      '14 de setembro de 2026',
    )
  })

  it('evento de um dia e evento de vários dias', () => {
    const inicio = new Date('2026-09-12T11:00:00Z')
    expect(formatEventDateShort(inicio, new Date('2026-09-12T21:00:00Z'))).toBe(
      '12/09/2026',
    )
    expect(formatEventDateLong(inicio, null)).toBe('12 de setembro de 2026')

    const fim = new Date('2026-09-14T21:00:00Z')
    expect(formatEventDateShort(inicio, fim)).toBe('12/09/2026 a 14/09/2026')
    expect(formatEventDateLong(inicio, fim)).toBe('12 a 14 de setembro de 2026')
  })
})

describe('CPF mascarado', () => {
  it('só os 3 últimos dígitos existem, então só eles aparecem', () => {
    expect(formatCpfMasked('145')).toBe('***.***.**1-45')
  })

  it('sem CPF, texto vazio', () => {
    expect(formatCpfMasked(null)).toBe('')
  })
})

describe('sequência', () => {
  it('quatro dígitos, e o ano quando pedido', () => {
    expect(formatSequence(42)).toBe('0042')
    expect(formatSequence(42, 2026)).toBe('0042/2026')
    expect(formatSequence(12345)).toBe('12345')
  })
})

// PDF-18 do doc 05.
describe('title_pt_br e uppercase', () => {
  it.each([
    ['MARIA DOS SANTOS', 'Maria dos Santos'],
    ['ana-clara d’ávila', 'Ana-Clara D’Ávila'],
    ["ana-clara d'ávila", "Ana-Clara D'Ávila"],
    ['JOÃO E MARIA', 'João e Maria'],
    ['de souza', 'De Souza'],
    ['josé   gonçalves', 'José Gonçalves'],
    ['maria DA silva do carmo e souza', 'Maria da Silva do Carmo e Souza'],
  ])('%j → %j', (entrada, esperado) => {
    expect(titleCasePtBr(entrada)).toBe(esperado)
  })

  it('uppercase respeita o acento', () => {
    expect(applyTransform('José Gonçalves', 'uppercase')).toBe('JOSÉ GONÇALVES')
    expect(applyTransform('ana lima', 'none')).toBe('ana lima')
    expect(applyTransform('ANA LIMA', 'title_pt_br')).toBe('Ana Lima')
  })
})
