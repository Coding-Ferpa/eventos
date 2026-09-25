// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  COOKIE_DE_DISPOSITIVO,
  OPCOES_DO_COOKIE_DE_DISPOSITIVO,
  criarCookieDeDispositivo,
  lerCookieDeDispositivo,
} from './device'

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres'
const EMISSAO = new Date('2026-09-12T11:00:00Z')
const DIA = 24 * 60 * 60 * 1000

function depoisDe(ms: number) {
  return new Date(EMISSAO.getTime() + ms)
}

describe('cookie de dispositivo (doc 08)', () => {
  it('tem o formato do doc: v1.{id de 128 bits}.{emitido_em}.{HMAC}', () => {
    expect(criarCookieDeDispositivo(SEGREDO, EMISSAO)).toMatch(
      /^v1\.[A-Za-z0-9_-]{22}\.\d+\.[A-Za-z0-9_-]{43}$/,
    )
  })

  it('ida e volta: o que foi emitido é lido, e devolve o id', () => {
    const valor = criarCookieDeDispositivo(SEGREDO, EMISSAO)
    const id = lerCookieDeDispositivo(valor, SEGREDO, EMISSAO)

    expect(id).toBe(valor.split('.')[1])
  })

  it('cada emissão é um dispositivo novo', () => {
    expect(criarCookieDeDispositivo(SEGREDO, EMISSAO).split('.')[1]).not.toBe(
      criarCookieDeDispositivo(SEGREDO, EMISSAO).split('.')[1],
    )
  })

  it('recusa id trocado, assinatura trocada e segredo diferente', () => {
    const [versao, id, emitidoEm, assinatura] = criarCookieDeDispositivo(
      SEGREDO,
      EMISSAO,
    ).split('.')
    const outroId = `${id?.slice(0, -1)}${id?.endsWith('A') ? 'B' : 'A'}`
    const outraAssinatura = `${assinatura?.slice(0, -1)}${assinatura?.endsWith('A') ? 'B' : 'A'}`

    expect(
      lerCookieDeDispositivo(
        `${versao}.${outroId}.${emitidoEm}.${assinatura}`,
        SEGREDO,
        EMISSAO,
      ),
    ).toBeNull()
    expect(
      lerCookieDeDispositivo(
        `${versao}.${id}.${emitidoEm}.${outraAssinatura}`,
        SEGREDO,
        EMISSAO,
      ),
    ).toBeNull()
    expect(
      lerCookieDeDispositivo(
        criarCookieDeDispositivo(SEGREDO, EMISSAO),
        `${SEGREDO}-outro`,
        EMISSAO,
      ),
    ).toBeNull()
  })

  it('vale 30 dias, e não um a mais', () => {
    const valor = criarCookieDeDispositivo(SEGREDO, EMISSAO)

    expect(lerCookieDeDispositivo(valor, SEGREDO, depoisDe(29 * DIA))).not.toBeNull()
    expect(lerCookieDeDispositivo(valor, SEGREDO, depoisDe(31 * DIA))).toBeNull()
  })

  it('recusa emissão no futuro, com folga de relógio de alguns minutos', () => {
    const valor = criarCookieDeDispositivo(SEGREDO, depoisDe(DIA))

    expect(lerCookieDeDispositivo(valor, SEGREDO, EMISSAO)).toBeNull()
    expect(
      lerCookieDeDispositivo(
        criarCookieDeDispositivo(SEGREDO, depoisDe(60_000)),
        SEGREDO,
        EMISSAO,
      ),
    ).not.toBeNull()
  })

  it.each([
    [undefined],
    [''],
    ['lixo'],
    ['v1.a.b'],
    ['v2.AAAAAAAAAAAAAAAAAAAAAA.1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['v1.AAAAAAAAAAAAAAAAAAAAAA.agora.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
  ])('recusa valor malformado: %j', (valor) => {
    expect(lerCookieDeDispositivo(valor, SEGREDO, EMISSAO)).toBeNull()
  })

  it('é cookie de segurança: HttpOnly, Secure, SameSite=Lax, 30 dias, no site inteiro', () => {
    expect(COOKIE_DE_DISPOSITIVO).toBe('cf-dispositivo')
    expect(OPCOES_DO_COOKIE_DE_DISPOSITIVO).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    })
  })
})
