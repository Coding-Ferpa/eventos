import { describe, expect, it } from 'vitest'

import { toPdfY, toPt } from './coords'
import { fitText, type FitInput } from './fit-text'

/** Fonte monoespaçada de mentira: cada caractere mede 0,5 em. */
const mono = (texto: string) => texto.length * 0.5

function ajustar(parcial: Partial<FitInput> & Pick<FitInput, 'text'>) {
  return fitText({
    widthPt: 200,
    heightPt: 40,
    sizePt: 20,
    minSizePt: 10,
    maxLines: 2,
    lineHeight: 1,
    mode: 'shrink_then_wrap',
    measure: mono,
    ...parcial,
  })
}

describe('coords', () => {
  it('normalizado vira pt da página canônica', () => {
    expect(
      toPt({ x: 0.1, y: 0.5, w: 0.8, h: 0.1 }, { widthPt: 800, heightPt: 600 }),
    ).toEqual({
      x: 80,
      y: 300,
      w: 640,
      h: 60,
    })
  })

  it('a única inversão de eixo do sistema', () => {
    expect(toPdfY(595.28, 100)).toBeCloseTo(495.28, 6)
  })
})

describe('shrink_then_wrap', () => {
  // PDF-03 do doc 05.
  it('nome curto sai no tamanho nominal, em uma linha', () => {
    expect(ajustar({ text: 'Ana Lima' })).toEqual({
      sizePt: 20,
      lines: ['Ana Lima'],
      belowMin: false,
    })
  })

  it('encolhe em passos de 0,25 pt até caber em uma linha', () => {
    // 22 caracteres × 0,5 = 11 em; 200 / 11 = 18,18 → 18.
    expect(ajustar({ text: 'Maria Eduarda Pessoa R' })).toEqual({
      sizePt: 18,
      lines: ['Maria Eduarda Pessoa R'],
      belowMin: false,
    })
  })

  it('quando encolher não basta, quebra onde a linha mais larga fica menor', () => {
    const resultado = ajustar({ text: 'Maria Eduarda dos Santos Albuquerque Pessoa' })

    expect(resultado.lines).toHaveLength(2)
    expect(resultado.lines.join(' ')).toBe('Maria Eduarda dos Santos Albuquerque Pessoa')
    expect(resultado.belowMin).toBe(false)
    for (const linha of resultado.lines) {
      expect(mono(linha) * resultado.sizePt).toBeLessThanOrEqual(200)
    }
    expect(resultado.sizePt * 2).toBeLessThanOrEqual(40)
  })

  // PDF-05 do doc 05.
  it('no empate, a partícula abre a linha de baixo', () => {
    // "Abc dos | Def" e "Abc | dos Def" têm a mesma linha mais larga (7
    // caracteres), e o mínimo de 15 pt impede uma linha só: o desempate decide.
    const resultado = ajustar({
      text: 'Abc dos Def',
      widthPt: 50,
      heightPt: 100,
      sizePt: 20,
      minSizePt: 15,
    })

    expect(resultado.lines).toEqual(['Abc', 'dos Def'])
  })

  it('o desempate vale mesmo quando a quebra com partícula no fim vem primeiro', () => {
    // "Abcd dos | Ef Ghijklmn" e "Abcd dos Ef | Ghijklmn" empatam (a maior
    // linha tem 11 caracteres), e a primeira termina em partícula.
    const resultado = ajustar({
      text: 'Abcd dos Ef Ghijklmn',
      widthPt: 100,
      heightPt: 100,
      minSizePt: 15,
    })

    expect(resultado.lines).toEqual(['Abcd dos Ef', 'Ghijklmn'])
  })

  // PDF-04 do doc 05.
  it('nada coube no mínimo: abaixo do mínimo, avisa, e o texto sai inteiro dentro da caixa', () => {
    const texto = 'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues'
    const resultado = ajustar({ text: texto, maxLines: 1, widthPt: 100 })

    expect(resultado.belowMin).toBe(true)
    expect(resultado.lines).toEqual([texto])
    expect(mono(texto) * resultado.sizePt).toBeLessThanOrEqual(100)
    expect(resultado.sizePt).toBeLessThan(10)
  })

  it('texto vazio não desenha linha nenhuma', () => {
    expect(ajustar({ text: '   ' })).toEqual({ sizePt: 20, lines: [], belowMin: false })
  })

  it('espaços repetidos viram um só', () => {
    expect(ajustar({ text: 'Ana   Lima' }).lines).toEqual(['Ana Lima'])
  })
})

describe('wrap_then_shrink', () => {
  const paragrafo = (parcial: Partial<FitInput> & Pick<FitInput, 'text'>) =>
    ajustar({
      mode: 'wrap_then_shrink',
      maxLines: 4,
      heightPt: 100,
      lineHeight: 1.2,
      ...parcial,
    })

  it('quebra gulosa no tamanho nominal quando cabe', () => {
    const resultado = paragrafo({ text: 'participou do evento como palestrante' })

    expect(resultado.sizePt).toBe(20)
    expect(resultado.lines.join(' ')).toBe('participou do evento como palestrante')
    for (const linha of resultado.lines) expect(mono(linha) * 20).toBeLessThanOrEqual(200)
  })

  // PDF-17 do doc 05.
  it('encolhe de 0,5 em 0,5 pt até caber em max_lines e na altura', () => {
    const texto =
      'participou como palestrante com a palestra Introdução ao versionamento com Git e GitHub na prática'
    const resultado = paragrafo({ text: texto })

    expect(resultado.lines.length).toBeLessThanOrEqual(4)
    expect(resultado.lines.join(' ')).toBe(texto)
    expect(resultado.lines.length * 1.2 * resultado.sizePt).toBeLessThanOrEqual(100)
    expect((resultado.sizePt * 2) % 1).toBe(0)
    expect(resultado.belowMin).toBe(false)
  })

  it('abaixo do mínimo segue até o piso de 4 pt, avisando', () => {
    const texto = 'palavra '.repeat(40).trim()
    const resultado = paragrafo({ text: texto, heightPt: 30 })

    expect(resultado.belowMin).toBe(true)
    expect(resultado.sizePt).toBeGreaterThanOrEqual(4)
    expect(resultado.lines.join(' ')).toBe(texto)
  })

  it('palavra mais larga que a caixa encolhe até caber, em vez de vazar', () => {
    const resultado = paragrafo({
      text: 'Pneumoultramicroscopicossilicovulcanoconiótico',
      widthPt: 150,
    })

    for (const linha of resultado.lines) {
      expect(mono(linha) * resultado.sizePt).toBeLessThanOrEqual(150)
    }
  })
})
