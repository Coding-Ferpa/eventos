import { describe, expect, it } from 'vitest'

import { z } from './zod'

/**
 * Guarda de regressão do locale. Duas coisas podem fazer a interface deixar de
 * falar português do Brasil sem nenhum outro teste quebrar:
 *
 * 1. Alguém move a configuração para o bootstrap, ou importa `zod` direto num
 *    schema, e a mensagem volta ao inglês (ADR-0016 do CF Jobs).
 * 2. O Zod muda o que cada locale significa. Aconteceu na 4.6: o `pt` passou a
 *    ser o de Portugal, e o do Brasil virou `pt-BR`.
 *
 * As asserções são sobre essas duas propriedades, e não sobre a frase exata,
 * que é do Zod e muda entre versões menores. A primeira versão deste teste
 * afirmava a palavra "inválido" e quebrou quando a frase virou "Entrada
 * inválida".
 */

const INGLES = /invalid|expected|received|too (big|small)/i
// Marcas do português de Portugal que o `pt` do Zod passou a usar.
const PORTUGAL = /demasiado/i

function mensagem(resultado: { error?: { issues: { message: string }[] } }) {
  return resultado.error?.issues[0]?.message ?? ''
}

describe('z', () => {
  it('fala português, e não inglês, nas mensagens embutidas', () => {
    const tipo = mensagem(z.string().safeParse(42))
    const url = mensagem(z.url().safeParse('não é url'))
    const faixa = mensagem(z.number().max(10).safeParse(11))

    for (const texto of [tipo, url, faixa]) {
      expect(texto).not.toBe('')
      expect(texto).not.toMatch(INGLES)
    }
    expect(tipo).toMatch(/inválid/)
  })

  it('fala o português do Brasil, e não o de Portugal', () => {
    const grande = mensagem(z.number().max(10).safeParse(11))
    const pequeno = mensagem(z.string().min(3).safeParse('a'))

    expect(grande).not.toMatch(PORTUGAL)
    expect(pequeno).not.toMatch(PORTUGAL)
    expect(grande).toMatch(/demais/i)
  })
})
