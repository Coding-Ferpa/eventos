import { describe, expect, it } from 'vitest'

import {
  dataHoraDeSaoPauloParaUtc,
  formatarLocal,
  formatarPeriodo,
  isoEmSaoPaulo,
  utcParaDataHoraDeSaoPaulo,
} from './format'

describe('formatarPeriodo', () => {
  it('evento de um dia: a data longa, no fuso de São Paulo', () => {
    // 08h a 18h em São Paulo.
    expect(
      formatarPeriodo(new Date('2026-09-12T11:00:00Z'), new Date('2026-09-12T21:00:00Z')),
    ).toBe('12 de setembro de 2026')
  })

  it('sem data de término, só o dia do início', () => {
    expect(formatarPeriodo(new Date('2026-03-14T12:00:00Z'), null)).toBe(
      '14 de março de 2026',
    )
  })

  it('vários dias no mesmo mês: o mês e o ano aparecem uma vez só', () => {
    expect(
      formatarPeriodo(new Date('2026-03-14T12:00:00Z'), new Date('2026-03-16T20:00:00Z')),
    ).toBe('14 a 16 de março de 2026')
  })

  it('conta o dia em São Paulo, e não em UTC', () => {
    // Termina às 22h do dia 23 em São Paulo, que já é dia 24 em UTC. É o
    // caso da Semana Acadêmica do seed: em UTC, a página diria "19 a 24".
    expect(
      formatarPeriodo(new Date('2026-10-19T22:00:00Z'), new Date('2026-10-24T01:00:00Z')),
    ).toBe('19 a 23 de outubro de 2026')
  })

  it('vira o mês: cada ponta com o seu mês', () => {
    expect(
      formatarPeriodo(new Date('2026-03-30T12:00:00Z'), new Date('2026-04-02T20:00:00Z')),
    ).toBe('30 de março a 2 de abril de 2026')
  })

  it('vira o ano: cada ponta completa', () => {
    expect(
      formatarPeriodo(new Date('2026-12-30T12:00:00Z'), new Date('2027-01-02T20:00:00Z')),
    ).toBe('30 de dezembro de 2026 a 2 de janeiro de 2027')
  })

  it('não usa travessão nem meia-risca entre as datas', () => {
    // O Intl tem `formatRange`, mas ele junta as pontas com "–".
    const texto = formatarPeriodo(
      new Date('2026-03-14T12:00:00Z'),
      new Date('2026-03-16T20:00:00Z'),
    )

    expect(texto).not.toMatch(/[–—]/)
  })
})

describe('formatarLocal', () => {
  it('cidade e estado', () => {
    expect(formatarLocal({ city: 'Fernandópolis', state: 'SP' })).toBe(
      'Fernandópolis, SP',
    )
  })

  it('cidade sem estado', () => {
    expect(formatarLocal({ city: 'Fernandópolis', state: null })).toBe('Fernandópolis')
  })

  it('sem cidade, o evento é on-line', () => {
    expect(formatarLocal({ city: null, state: null })).toBe('On-line')
    expect(formatarLocal({ city: '  ', state: 'SP' })).toBe('On-line')
  })
})

describe('isoEmSaoPaulo', () => {
  it('a hora local de São Paulo, com o deslocamento explícito', () => {
    expect(isoEmSaoPaulo(new Date('2026-09-12T11:00:00Z'))).toBe(
      '2026-09-12T08:00:00-03:00',
    )
  })

  it('vira o dia quando São Paulo ainda está no dia anterior', () => {
    expect(isoEmSaoPaulo(new Date('2026-10-24T01:00:00Z'))).toBe(
      '2026-10-23T22:00:00-03:00',
    )
  })
})

describe('campo de data e hora do formulário', () => {
  it('o que se digita é hora de São Paulo, e o banco guarda UTC', () => {
    expect(dataHoraDeSaoPauloParaUtc('2026-09-12T08:00').toISOString()).toBe(
      '2026-09-12T11:00:00.000Z',
    )
  })

  it('22h em São Paulo já é o dia seguinte em UTC', () => {
    expect(dataHoraDeSaoPauloParaUtc('2026-10-23T22:00').toISOString()).toBe(
      '2026-10-24T01:00:00.000Z',
    )
  })

  it('volta para o campo como a pessoa digitou', () => {
    expect(utcParaDataHoraDeSaoPaulo(new Date('2026-10-24T01:00:00Z'))).toBe(
      '2026-10-23T22:00',
    )
  })

  it('ida e volta não perde nada', () => {
    for (const local of ['2026-01-01T00:00', '2026-06-15T13:45', '2026-12-31T23:59']) {
      expect(utcParaDataHoraDeSaoPaulo(dataHoraDeSaoPauloParaUtc(local))).toBe(local)
    }
  })
})
