// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { PDFDocument } from '@cantoo/pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'

import { CURATED_FONTS, fallbackFor, findCuratedFont } from './catalog'
import { checkCoverage, isVariableFont, REQUIRED_CHARACTERS } from './coverage'
import { cachedFontkit, FONT_FEATURES, loadFont, type FontMetrics } from './metrics'

const PASTA = path.resolve(process.cwd(), 'public/fonts/cert')
const bytesDe = (arquivo: string) =>
  new Uint8Array(readFileSync(path.join(PASTA, arquivo)))

describe('catálogo curado', () => {
  it('toda fonte do catálogo existe em public/fonts/cert/', () => {
    for (const fonte of CURATED_FONTS) {
      expect(() => bytesDe(fonte.file), fonte.file).not.toThrow()
    }
  })

  it('a referência acha a fonte, e referência desconhecida não acha', () => {
    expect(findCuratedFont('curated:poppins-600')?.file).toBe('Poppins-SemiBold.ttf')
    expect(findCuratedFont('curated:comic-sans-400')).toBeUndefined()
  })

  it('a fonte de reserva tem o peso mais próximo do pedido', () => {
    expect(fallbackFor(400).ref).toBe('curated:poppins-400')
    expect(fallbackFor(500).ref).toBe('curated:poppins-400')
    expect(fallbackFor(650).ref).toBe('curated:poppins-600')
    expect(fallbackFor(900).ref).toBe('curated:poppins-700')
  })
})

describe('métricas', () => {
  let poppins: FontMetrics

  beforeAll(() => {
    poppins = loadFont(bytesDe('Poppins-SemiBold.ttf'))
  })

  it('lê unitsPerEm, ascent e descent da fonte', () => {
    expect(poppins.unitsPerEm).toBe(1000)
    expect(poppins.ascent).toBeGreaterThan(0)
    expect(poppins.descent).toBeLessThan(0)
  })

  it('largura é linear no tamanho', () => {
    const em1 = poppins.widthAt('José Gonçalves', 1)
    expect(poppins.widthAt('José Gonçalves', 32)).toBeCloseTo(em1 * 32, 6)
  })

  // PDF-11 do doc 05: a mesma conta do pdf-lib, que é quem desenha.
  //
  // Limite conhecido: a Poppins do Google Fonts não tem kerning latino nem
  // ligaduras, então aqui a soma dos avanços e as posições do layout
  // coincidem, e este teste não distingue as duas contas. Ele passa a
  // distinguir com a primeira fonte com kerning do catálogo (M6).
  it('mede como o pdf-lib, para 50 nomes, com tolerância de 0,01 pt', async () => {
    const doc = await PDFDocument.create()
    doc.registerFontkit(cachedFontkit)
    const fonte = await doc.embedFont(bytesDe('Poppins-SemiBold.ttf'), {
      subset: true,
      features: FONT_FEATURES,
    })

    const nomes = Array.from({ length: 50 }, (_, i) =>
      [
        'José Gonçalves de Assunção',
        'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues',
        "Ana-Clara D'Ávila",
        'João Pedro da Silva',
        'Ângela Muñoz Ñandú',
      ][i % 5]!.repeat(1 + (i % 3)),
    )
    for (const nome of nomes) {
      expect(
        Math.abs(poppins.widthAt(nome, 32) - fonte.widthOfTextAtSize(nome, 32)),
      ).toBeLessThan(0.01)
    }
  })

  it('a fonte parseada é a mesma para o layout e para o pdf-lib (cache por identidade)', () => {
    const bytes = bytesDe('Poppins-Bold.ttf')
    expect(cachedFontkit.create(bytes)).toBe(cachedFontkit.create(bytes))
    expect(loadFont(bytes).font).toBe(cachedFontkit.create(bytes))
  })

  it('aponta os caracteres que a fonte não tem', () => {
    expect(poppins.missingCharacters('José Gonçalves')).toEqual([])
    expect(poppins.missingCharacters('Ωmega Дима Ω')).toEqual(['Ω', 'Д', 'и', 'м', 'а'])
  })

  it('entrega os contornos dos glifos com o avanço de cada um', () => {
    const glifos = poppins.glyphs('Aç')
    expect(glifos).toHaveLength(2)
    expect(glifos[0]?.path).toMatch(/^M/)
    expect(glifos.reduce((soma, glifo) => soma + glifo.advance, 0)).toBeCloseTo(
      poppins.widthAt('Aç', poppins.unitsPerEm),
      6,
    )
  })
})

describe('cobertura de glifos pt-BR', () => {
  it('a lista exigida tem os acentos do português', () => {
    for (const letra of ['Ã', 'ç', 'õ', 'º', 'ª', '°', '"']) {
      expect(REQUIRED_CHARACTERS).toContain(letra)
    }
  })

  it('a Poppins cobre tudo', () => {
    expect(checkCoverage(loadFont(bytesDe('Poppins-Regular.ttf')))).toEqual({
      ok: true,
      missing: [],
    })
  })

  it('fonte sem ç é recusada, dizendo o que falta (PDF-22)', () => {
    const semCedilha: Pick<FontMetrics, 'missingCharacters'> = {
      missingCharacters: (texto) =>
        [...new Set(texto)].filter((c) => c === 'ç' || c === 'Ç'),
    }
    expect(checkCoverage(semCedilha)).toEqual({ ok: false, missing: ['Ç', 'ç'] })
  })

  it('fonte variável é reconhecida (PDF-22)', () => {
    expect(isVariableFont(loadFont(bytesDe('Poppins-Regular.ttf')).font)).toBe(false)
    expect(
      isVariableFont({
        variationAxes: { wght: { name: 'Weight', min: 100, default: 400, max: 900 } },
      }),
    ).toBe(true)
  })
})
