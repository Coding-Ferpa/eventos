// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { hashDiario } from './hmac'

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres'

describe('hashDiario (doc 08)', () => {
  it('é estável dentro do mesmo dia UTC', () => {
    expect(hashDiario(SEGREDO, 'id-1', new Date('2026-09-12T00:00:01Z'))).toBe(
      hashDiario(SEGREDO, 'id-1', new Date('2026-09-12T23:59:59Z')),
    )
  })

  it('gira à meia-noite UTC: não serve para seguir alguém por dias', () => {
    expect(hashDiario(SEGREDO, 'id-1', new Date('2026-09-12T23:59:59Z'))).not.toBe(
      hashDiario(SEGREDO, 'id-1', new Date('2026-09-13T00:00:00Z')),
    )
  })

  it('muda com o valor e com o segredo', () => {
    const agora = new Date('2026-09-12T12:00:00Z')

    expect(hashDiario(SEGREDO, 'id-1', agora)).not.toBe(
      hashDiario(SEGREDO, 'id-2', agora),
    )
    expect(hashDiario(SEGREDO, 'id-1', agora)).not.toBe(
      hashDiario(`${SEGREDO}-outro`, 'id-1', agora),
    )
  })

  it('não carrega o valor original', () => {
    expect(hashDiario(SEGREDO, '203.0.113.7', new Date())).not.toContain('203.0.113.7')
  })
})
