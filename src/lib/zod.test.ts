import { describe, expect, it } from 'vitest'

import { z } from './zod'

/**
 * Guarda de regressão do ADR-0016: o locale é configurado neste módulo, e não
 * no bootstrap, porque o Next compila `instrumentation.ts` em um bundle
 * separado do das rotas. Se alguém mover a configuração de lugar, ou importar
 * `zod` direto em um schema, a mensagem volta a sair em inglês sem nenhum
 * teste quebrar, a não ser este.
 */
describe('z', () => {
  it('fala português nas mensagens embutidas', () => {
    const resultado = z.string().safeParse(42)

    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.message).toContain('inválido')
  })

  it('traduz também as validações de formato e de faixa', () => {
    const url = z.url().safeParse('não é url')
    const numero = z.number().max(10).safeParse(11)

    // O que importa é não sair em inglês: a frase exata é do Zod.
    expect(url.error?.issues[0]?.message).not.toMatch(/invalid|expected/i)
    expect(numero.error?.issues[0]?.message).not.toMatch(/too big|expected/i)
  })
})
