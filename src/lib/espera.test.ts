import { describe, expect, it } from 'vitest'

import { formatarEspera, textoDaContagem } from './espera'

describe('formatarEspera (doc 03: "tente de novo em {tempo}")', () => {
  it.each([
    [1, '1 segundo'],
    [40, '40 segundos'],
    [59, '59 segundos'],
    [60, '1 minuto'],
    [61, '2 minutos'],
    [12 * 60, '12 minutos'],
    [3600, '1 hora'],
    [3601, '2 horas'],
    [23 * 3600 + 10, '24 horas'],
  ])('%i s viram "%s"', (segundos, texto) => {
    expect(formatarEspera(segundos)).toBe(texto)
  })

  it('nunca promete menos de um segundo', () => {
    expect(formatarEspera(0)).toBe('1 segundo')
    expect(formatarEspera(-5)).toBe('1 segundo')
  })
})

describe('textoDaContagem (doc 03, 6b: a contagem do painel de 429)', () => {
  it.each([
    [42, '42 segundos'],
    [1, '1 segundo'],
    [60, '60 segundos'],
    [61, 'cerca de 2 minutos'],
    [180, 'cerca de 3 minutos'],
  ])('%i s viram "%s"', (segundos, texto) => {
    expect(textoDaContagem(segundos)).toBe(texto)
  })
})
