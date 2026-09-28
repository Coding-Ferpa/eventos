import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'

import { buildQr, QR_QUIET_ZONE } from './qr'

const URL_DE_VALIDACAO = 'https://eventos.codingferpa.org/validar/DEM0CF2026'

/**
 * Lê o path que o motor desenhou de volta para uma grade de módulos: é o
 * desenho, e não a string de entrada, que o teste confere (doc 05, PDF-13).
 */
function gradeDoPath(path: string, modulos: number): boolean[][] {
  const grade = Array.from({ length: modulos }, () => Array<boolean>(modulos).fill(false))
  for (const [, x, y, largura] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let i = 0; i < Number(largura); i++) grade[Number(y)]![Number(x) + i] = true
  }
  return grade
}

function decodificar(path: string, modulos: number): string | null {
  const PIXELS_POR_MODULO = 4
  const lado = modulos * PIXELS_POR_MODULO
  const imagem = new Uint8ClampedArray(lado * lado * 4).fill(255)
  const grade = gradeDoPath(path, modulos)

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      if (grade[Math.floor(y / PIXELS_POR_MODULO)]![Math.floor(x / PIXELS_POR_MODULO)]) {
        const i = (y * lado + x) * 4
        imagem[i] = imagem[i + 1] = imagem[i + 2] = 0
      }
    }
  }
  return jsQR(imagem, lado, lado)?.data ?? null
}

// PDF-13 do doc 05.
describe('buildQr', () => {
  it('a URL de validação de 50 caracteres dá a versão 4: 33 módulos, mais a zona de silêncio', () => {
    const qr = buildQr(URL_DE_VALIDACAO)

    expect(URL_DE_VALIDACAO).toHaveLength(50)
    expect(qr.modules).toBe(33 + 2 * QR_QUIET_ZONE)
  })

  it('o desenho, lido por um decodificador de verdade, é a URL esperada', () => {
    const qr = buildQr(URL_DE_VALIDACAO)

    expect(decodificar(qr.path, qr.modules)).toBe(URL_DE_VALIDACAO)
  })

  it('é um path único, com as corridas horizontais fundidas', () => {
    const { path } = buildQr(URL_DE_VALIDACAO)

    expect(path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/)
    // Sem fundir, seriam centenas de quadrados de largura 1.
    expect(
      [...path.matchAll(/h(\d+)v/g)].some(([, largura]) => Number(largura) > 1),
    ).toBe(true)
  })

  it('a zona de silêncio fica vazia, dentro da caixa', () => {
    const qr = buildQr(URL_DE_VALIDACAO)
    const grade = gradeDoPath(qr.path, qr.modules)

    for (let i = 0; i < QR_QUIET_ZONE; i++) {
      expect(grade[i]!.every((modulo) => !modulo)).toBe(true)
      expect(grade.every((linha) => !linha[i])).toBe(true)
    }
  })
})
