// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { hashDiario, hmacCpf } from './hmac'

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

describe('hmacCpf (ADR-0005)', () => {
  const PEPPER = 'Zm9ybWF0by1kZS1vcGVuc3NsLXJhbmQtYmFzZTY0LTMy'
  const SAL = '0123456789abcdef0123456789abcdef'

  it('bate com o openssl: a chave é o texto do env, como está, e não o base64 decodificado', () => {
    // printf "$SAL:52998224725" | openssl dgst -sha256 -hmac "$PEPPER"
    expect(hmacCpf(PEPPER, SAL, '52998224725')).toBe(
      'e8a4ef7bc9373e64f4fd90b2fb12719e9577584c6b32bfcea7cf35a67427ac61',
    )
    // O mesmo com a chave decodificada do base64. O pepper nunca muda, então
    // esta escolha também não pode mudar.
    expect(hmacCpf(PEPPER, SAL, '52998224725')).not.toBe(
      '892c59b25259d1ae0053ceedcd762fbfb3b16e431f54da3ef5d1ccaccaa37300',
    )
  })

  it('o sal do evento muda o hash: um vazamento não cruza eventos', () => {
    expect(hmacCpf(PEPPER, SAL, '52998224725')).not.toBe(
      hmacCpf(PEPPER, 'fedcba9876543210fedcba9876543210', '52998224725'),
    )
  })

  it('recusa CPF fora do formato canônico, para nunca gravar hash de máscara', () => {
    expect(() => hmacCpf(PEPPER, SAL, '529.982.247-25')).toThrow()
    expect(() => hmacCpf(PEPPER, SAL, '5299822472')).toThrow()
  })
})
