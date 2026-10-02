import { describe, expect, it } from 'vitest'

import { dataParaIso, mascararCpf, mascararData } from './mascaras'

describe('mascararCpf', () => {
  it.each([
    ['', ''],
    ['1', '1'],
    ['123', '123'],
    ['1234', '123.4'],
    ['123456', '123.456'],
    ['1234567', '123.456.7'],
    ['123456789', '123.456.789'],
    ['1234567890', '123.456.789-0'],
    ['12345678901', '123.456.789-01'],
  ])('%j vira %j enquanto se digita', (entrada, saida) => {
    expect(mascararCpf(entrada)).toBe(saida)
  })

  it('aceita colar com ou sem pontuação', () => {
    expect(mascararCpf('529.982.247-25')).toBe('529.982.247-25')
    expect(mascararCpf('529 982 247 25')).toBe('529.982.247-25')
    expect(mascararCpf(' 52998224725 ')).toBe('529.982.247-25')
  })

  it('para nos 11 dígitos e ignora o que não é número', () => {
    expect(mascararCpf('529982247251234')).toBe('529.982.247-25')
    expect(mascararCpf('cpf: 529a98')).toBe('529.98')
  })
})

describe('mascararData', () => {
  it.each([
    ['', ''],
    ['1', '1'],
    ['15', '15'],
    ['150', '15/0'],
    ['1503', '15/03'],
    ['15032', '15/03/2'],
    ['15032004', '15/03/2004'],
    ['15/03/2004', '15/03/2004'],
    ['150320041', '15/03/2004'],
  ])('%j vira %j', (entrada, saida) => {
    expect(mascararData(entrada)).toBe(saida)
  })
})

describe('dataParaIso', () => {
  const hoje = new Date('2026-10-02T12:00:00Z')

  it('converte a data do formulário para aaaa-mm-dd', () => {
    expect(dataParaIso('15/03/2004', hoje)).toBe('2004-03-15')
    expect(dataParaIso('15032004', hoje)).toBe('2004-03-15')
  })

  it('respeita o calendário, inclusive o bissexto', () => {
    expect(dataParaIso('29/02/2004', hoje)).toBe('2004-02-29')
    expect(dataParaIso('29/02/2003', hoje)).toBeNull()
    expect(dataParaIso('31/04/2004', hoje)).toBeNull()
    expect(dataParaIso('00/01/2004', hoje)).toBeNull()
    expect(dataParaIso('10/13/2004', hoje)).toBeNull()
  })

  it('recusa data incompleta, antiga demais ou no futuro', () => {
    expect(dataParaIso('15/03/04', hoje)).toBeNull()
    expect(dataParaIso('', hoje)).toBeNull()
    expect(dataParaIso('31/12/1899', hoje)).toBeNull()
    expect(dataParaIso('01/01/1900', hoje)).toBe('1900-01-01')
    expect(dataParaIso('02/10/2026', hoje)).toBe('2026-10-02')
    expect(dataParaIso('03/10/2026', hoje)).toBeNull()
  })
})
