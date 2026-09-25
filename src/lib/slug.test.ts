import { describe, expect, it } from 'vitest'

import { gerarSlug, SLUG } from './slug'

describe('gerarSlug (doc 02)', () => {
  it.each([
    ['Ferpa Tech Day 2026', 'ferpa-tech-day-2026'],
    ['Semana Acadêmica de TI 2026', 'semana-academica-de-ti-2026'],
    ['Oficina: Git & GitHub!', 'oficina-git-github'],
    ['  Ação   de   Coração  ', 'acao-de-coracao'],
    ['Pós-graduação — Aula 1', 'pos-graduacao-aula-1'],
    ['ÇÃÕÜ ñ', 'caou-n'],
  ])('%j → %s', (titulo, esperado) => {
    expect(gerarSlug(titulo)).toBe(esperado)
  })

  it('corta em 80 caracteres sem deixar hífen no fim', () => {
    const slug = gerarSlug(`${'palavra '.repeat(20)}final`)

    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug).not.toMatch(/-$/)
    expect(SLUG.test(slug)).toBe(true)
  })

  it('o resultado de qualquer título com letras cabe na regra do banco', () => {
    for (const titulo of ['A B C', 'Evento_2026', '100% on-line', 'São João']) {
      const slug = gerarSlug(titulo)
      expect(SLUG.test(slug), slug).toBe(true)
    }
  })

  it('título sem nenhuma letra ou algarismo dá slug vazio, e quem chama decide', () => {
    expect(gerarSlug('!!! ???')).toBe('')
  })
})
