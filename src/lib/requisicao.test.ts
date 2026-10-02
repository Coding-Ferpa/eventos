// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { criarCookieDeDispositivo } from './cookies/device'
import { hashDiario } from './hmac'
import { requisitante } from './requisicao'

const SEGREDOS = {
  DEVICE_COOKIE_SECRET: 'segredo-de-dispositivo-com-mais-de-32-caracteres',
  IP_HASH_SECRET: 'segredo-de-ip-com-mais-de-trinta-e-dois-caracteres',
}
const AGORA = new Date('2026-10-02T12:00:00Z')

function pedido(cabecalhos: Record<string, string>, cookie?: string) {
  return {
    headers: new Headers(cabecalhos),
    cookies: {
      get: (nome: string) =>
        nome === 'cf-dispositivo' && cookie ? { value: cookie } : undefined,
    },
  }
}

describe('requisitante', () => {
  it('o IP é o primeiro do x-forwarded-for, em HMAC do dia', () => {
    const { ipHash } = requisitante(
      pedido({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }),
      SEGREDOS,
      AGORA,
    )
    expect(ipHash).toBe(hashDiario(SEGREDOS.IP_HASH_SECRET, '203.0.113.7', AGORA))
  })

  it('cookie de dispositivo válido vira o HMAC do id', () => {
    const cookie = criarCookieDeDispositivo(SEGREDOS.DEVICE_COOKIE_SECRET, AGORA)
    const id = cookie.split('.')[1]!
    const { deviceHash } = requisitante(
      pedido({ 'x-forwarded-for': '203.0.113.7' }, cookie),
      SEGREDOS,
      AGORA,
    )
    expect(deviceHash).toBe(hashDiario(SEGREDOS.IP_HASH_SECRET, id, AGORA))
  })

  it('sem cookie, ou com cookie forjado, o dispositivo é o IP: os limites estreitos do PRD', () => {
    const semCookie = requisitante(
      pedido({ 'x-forwarded-for': '203.0.113.7' }),
      SEGREDOS,
      AGORA,
    )
    expect(semCookie.deviceHash).toBe(`nocookie:${semCookie.ipHash}`)
    const forjado = criarCookieDeDispositivo(
      'outro-segredo-qualquer-com-mais-de-32-caracteres',
      AGORA,
    )
    const comForjado = requisitante(
      pedido({ 'x-forwarded-for': '203.0.113.7' }, forjado),
      SEGREDOS,
      AGORA,
    )
    expect(comForjado.deviceHash).toBe(`nocookie:${comForjado.ipHash}`)
  })
})
