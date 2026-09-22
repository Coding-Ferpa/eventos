import { describe, expect, it } from 'vitest'

import { COOKIE_TEMA, isTema, MAX_AGE_DO_COOKIE, SCRIPT_DE_TEMA, TEMAS } from './theme'

describe('isTema', () => {
  it('aceita os temas que existem', () => {
    for (const tema of TEMAS) expect(isTema(tema)).toBe(true)
  })

  it('recusa qualquer outra coisa', () => {
    for (const valor of ['DARK', 'auto', '', null, undefined, 1, {}]) {
      expect(isTema(valor)).toBe(false)
    }
  })
})

describe('SCRIPT_DE_TEMA', () => {
  /**
   * O script roda inline antes da primeira pintura: um erro de sintaxe aqui
   * não aparece em lugar nenhum do build, só quebra o tema em produção.
   */
  it('é JavaScript válido', () => {
    expect(() => new Function(SCRIPT_DE_TEMA)).not.toThrow()
  })

  it('lê o mesmo cookie que a aplicação grava', () => {
    expect(SCRIPT_DE_TEMA).toContain(COOKIE_TEMA)
  })

  function rodar(cookie: string, prefereClaro: boolean): string | null {
    let aplicado: string | null = null

    const documento = {
      cookie,
      documentElement: {
        setAttribute: (_nome: string, valor: string) => {
          aplicado = valor
        },
      },
    }
    const janela = { matchMedia: () => ({ matches: prefereClaro }) }

    new Function('document', 'window', SCRIPT_DE_TEMA)(documento, janela)
    return aplicado
  }

  it('o cookie ganha da preferência do sistema', () => {
    expect(rodar(`${COOKIE_TEMA}=light`, false)).toBe('light')
    expect(rodar(`${COOKIE_TEMA}=dark`, true)).toBe('dark')
  })

  it('sem cookie, respeita o sistema', () => {
    expect(rodar('', true)).toBe('light')
    expect(rodar('', false)).toBe('dark')
  })

  it('escuro é o padrão quando nada dá certo', () => {
    // Identidade da comunidade (doc 03): na dúvida, escuro.
    expect(rodar('outro=valor', false)).toBe('dark')
    expect(rodar(`${COOKIE_TEMA}=roxo`, false)).toBe('dark')
  })

  it('não explode se o navegador negar acesso ao cookie', () => {
    let aplicado: string | null = null
    const documento = {
      get cookie(): string {
        throw new Error('bloqueado')
      },
      documentElement: {
        setAttribute: (_nome: string, valor: string) => {
          aplicado = valor
        },
      },
    }

    expect(() =>
      new Function('document', 'window', SCRIPT_DE_TEMA)(documento, {}),
    ).not.toThrow()
    expect(aplicado).toBe('dark')
  })
})

describe('MAX_AGE_DO_COOKIE', () => {
  it('dura um ano, para a escolha não se perder entre visitas', () => {
    expect(MAX_AGE_DO_COOKIE).toBe(365 * 24 * 60 * 60)
  })
})
