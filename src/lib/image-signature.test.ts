import { describe, expect, it } from 'vitest'

import { tipoDeImagemPelosBytes } from './image-signature'

const bytes = (...valores: number[]) => new Uint8Array(valores)
const texto = (s: string) => [...s].map((c) => c.charCodeAt(0))

describe('tipoDeImagemPelosBytes', () => {
  it('reconhece JPEG, PNG e WebP pela assinatura', () => {
    expect(tipoDeImagemPelosBytes(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('jpg')
    expect(
      tipoDeImagemPelosBytes(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
    ).toBe('png')
    expect(
      tipoDeImagemPelosBytes(bytes(...texto('RIFF'), 1, 2, 3, 4, ...texto('WEBPVP8 '))),
    ).toBe('webp')
  })

  it('recusa o que só tem a extensão certa', () => {
    expect(tipoDeImagemPelosBytes(bytes(...texto('<svg xmlns=')))).toBeNull()
    expect(tipoDeImagemPelosBytes(bytes(...texto('%PDF-1.7')))).toBeNull()
    expect(
      tipoDeImagemPelosBytes(bytes(...texto('RIFF'), 1, 2, 3, 4, ...texto('WAVE'))),
    ).toBeNull()
    expect(tipoDeImagemPelosBytes(bytes())).toBeNull()
  })
})
