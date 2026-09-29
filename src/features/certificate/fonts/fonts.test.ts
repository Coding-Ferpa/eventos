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
    expect(findCuratedFont('curated:inter-700')?.file).toBe('Inter-Bold.ttf')
    expect(findCuratedFont('curated:comic-sans-400')).toBeUndefined()
  })

  // ADR-0016: quatro famílias que entregam estático, nos pesos 400, 600 e 700.
  // O Playfair Display só existe como variável e ficou fora.
  it('quatro famílias, cada uma nos três pesos', () => {
    const familias = new Map<string, number[]>()
    for (const fonte of CURATED_FONTS) {
      familias.set(fonte.family, [...(familias.get(fonte.family) ?? []), fonte.weight])
    }
    expect(Object.fromEntries(familias)).toEqual({
      Poppins: [400, 600, 700],
      Inter: [400, 600, 700],
      Montserrat: [400, 600, 700],
      Lora: [400, 600, 700],
    })
  })

  it('a reserva é a Inter, no peso mais próximo do pedido', () => {
    expect(fallbackFor(400).ref).toBe('curated:inter-400')
    expect(fallbackFor(500).ref).toBe('curated:inter-400')
    expect(fallbackFor(650).ref).toBe('curated:inter-600')
    expect(fallbackFor(900).ref).toBe('curated:inter-700')
  })

  // A razão de a reserva ser a Inter (ADR-0016): das quatro, é a única que
  // cobre os cinco nomes; Montserrat e Lora não têm grego.
  it.each([
    ['vietnamita', 'Nguyễn Thị Ánh Tuyết'],
    ['grego', 'Γιώργος Παπαδόπουλος'],
    ['cirílico', 'Дмитрий Соколов'],
    ['turco', 'Şükrü Çağlayan Öztürk'],
    ['polonês', 'Łukasz Wróbel Żółć'],
  ])('a reserva cobre nome em %s', (_, nome) => {
    for (const peso of [400, 600, 700]) {
      const arquivo = fallbackFor(peso).file
      expect(loadFont(bytesDe(arquivo)).missingCharacters(nome), arquivo).toEqual([])
    }
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

  // PDF-11 do doc 05: a mesma conta do pdf-lib, que é quem desenha, em uma
  // fonte de cada família. Com a Poppins sozinha (M5) o teste não distinguia
  // soma de avanços de posições com kerning, porque ela não tem kerning
  // latino; as outras três têm, e o teste abaixo prova que ali as duas contas
  // diferem.
  it.each([
    'Poppins-SemiBold.ttf',
    'Inter-SemiBold.ttf',
    'Montserrat-SemiBold.ttf',
    'Lora-SemiBold.ttf',
  ])(
    '%s mede como o pdf-lib, para 50 nomes, com tolerância de 0,01 pt',
    async (arquivo) => {
      const metricas = loadFont(bytesDe(arquivo))
      const doc = await PDFDocument.create()
      doc.registerFontkit(cachedFontkit)
      const fonte = await doc.embedFont(bytesDe(arquivo), {
        subset: true,
        features: FONT_FEATURES,
      })

      const nomes = Array.from({ length: 50 }, (_, i) =>
        [
          'José Gonçalves de Assunção',
          'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues',
          "Ana-Clara D'Ávila",
          'Walter Tavares Wyatt',
          'Ângela Muñoz Ñandú',
        ][i % 5]!.repeat(1 + (i % 3)),
      )
      for (const nome of nomes) {
        expect(
          Math.abs(metricas.widthAt(nome, 32) - fonte.widthOfTextAtSize(nome, 32)),
        ).toBeLessThan(0.01)
      }
    },
  )

  // O que dá dentes ao PDF-11: numa fonte com kerning latino, a soma dos
  // avanços (a conta do pdf-lib e do motor) e as posições com kerning do
  // fontkit diferem de verdade. Quem trocasse a medida pelas posições faria o
  // layout prometer uma largura e o PDF desenhar outra, e o teste acima cai.
  it('com kerning latino, soma de avanços e posições com kerning diferem', () => {
    const inter = loadFont(bytesDe('Inter-SemiBold.ttf'))
    const texto = 'Walter Tavares Wyatt'
    const posicoes = inter.font.layout(texto, FONT_FEATURES).positions ?? []
    const comKerning =
      (posicoes.reduce((soma, posicao) => soma + posicao.xAdvance, 0) /
        inter.unitsPerEm) *
      32
    expect(inter.widthAt(texto, 32) - comKerning).toBeGreaterThan(1)
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

  it('a mesma letra dá o mesmo id de glifo, que é o que a prévia deduplica', () => {
    const [a, b, outroA] = poppins.glyphs('aba')
    expect(a!.id).toBe(outroA!.id)
    expect(a!.id).not.toBe(b!.id)
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
