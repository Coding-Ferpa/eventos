import { describe, expect, it } from 'vitest'

import { origemPermitida } from '@/lib/problema'

const SITE = 'https://eventos.codingferpa.org'

describe('origemPermitida', () => {
  it('aceita o endereço oficial, venha o pedido por onde vier', () => {
    expect(origemPermitida(SITE, SITE, 'eventos.codingferpa.org')).toBe(true)
    expect(origemPermitida(SITE, SITE, null)).toBe(true)
  })

  it('aceita a página aberta pelo outro endereço do próprio site', () => {
    expect(
      origemPermitida(
        'https://eventos-chi-eight.vercel.app',
        SITE,
        'eventos-chi-eight.vercel.app',
      ),
    ).toBe(true)
  })

  it('recusa outro site, inclusive outro projeto no vercel.app', () => {
    expect(origemPermitida('https://outro.site', SITE, 'eventos.codingferpa.org')).toBe(
      false,
    )
    expect(
      origemPermitida('https://golpe.vercel.app', SITE, 'eventos-chi-eight.vercel.app'),
    ).toBe(false)
  })

  it('recusa a origem de um endereço quando o pedido chega por outro', () => {
    expect(
      origemPermitida(
        'https://eventos-chi-eight.vercel.app',
        SITE,
        'eventos.codingferpa.org',
      ),
    ).toBe(false)
  })

  it('porta diferente é outra origem', () => {
    expect(
      origemPermitida('http://localhost:3001', 'http://localhost:3000', 'localhost:3000'),
    ).toBe(false)
  })

  it('sem Origin, com "null" ou com lixo: recusa', () => {
    expect(origemPermitida(null, SITE, 'eventos.codingferpa.org')).toBe(false)
    expect(origemPermitida('null', SITE, 'null')).toBe(false)
    expect(origemPermitida('não é url', SITE, 'eventos.codingferpa.org')).toBe(false)
  })
})
