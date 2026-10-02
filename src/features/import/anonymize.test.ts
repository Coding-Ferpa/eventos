// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { isValidCpf } from '@/lib/cpf'

import { anonymizeCsv } from './anonymize'
import { decodeCsv } from './decode'
import { parseCsv } from './parse'

const fixture = (nome: string) =>
  new Uint8Array(readFileSync(path.resolve(process.cwd(), 'tests/fixtures/csv', nome)))

function ler(bytes: Uint8Array) {
  const decodificado = decodeCsv(bytes)
  const lido = parseCsv(decodificado.text)
  if (!lido.ok) throw new Error(lido.error.code)
  return { ...decodificado, csv: lido.csv }
}

const ORIGINAIS = [
  'José Gonçalves de Assunção',
  'Maria Eduarda dos Santos Albuquerque',
  'Ângela Muñoz Ñandú',
  'João Pedro da Silva',
  'Ana-Clara D’Ávila',
  'Conceição Araújo Lima',
  'Luís Antônio Gonçalves',
]

describe('anonymizeCsv', () => {
  it.each([
    ['excel-ptbr-cp1252-semicolon.csv', 'windows-1252', ';', [0xef, 0xbb, 0xbf], false],
    ['excel-csv-utf8-bom-semicolon.csv', 'utf-8-bom', ';', [0xef, 0xbb, 0xbf], true],
    ['google-sheets-utf8-comma.csv', 'utf-8', ',', [0xef, 0xbb, 0xbf], false],
    ['excel-unicode-utf16le-tab.txt', 'utf-16le', '\t', [0xff, 0xfe], true],
  ] as const)(
    '%s: mesmo encoding, BOM, delimitador e cabeçalho; nenhum dado original',
    (arquivo, encoding, delimitador, bom, temBom) => {
      const original = fixture(arquivo)
      const anonimo = anonymizeCsv(original, { seed: 1 })
      const antes = ler(original)
      const depois = ler(anonimo)

      expect(depois.encoding).toBe(encoding)
      expect(depois.csv.delimiter).toBe(delimitador)
      expect([...anonimo.subarray(0, bom.length)].every((b, i) => b === bom[i])).toBe(
        temBom,
      )
      expect(depois.csv.headers).toEqual(antes.csv.headers)
      // O cabeçalho byte a byte (doc 06), e não só o mesmo texto.
      const cabecalho = (b: Uint8Array) => [...b.subarray(0, b.indexOf(0x0a) + 1)]
      expect(cabecalho(anonimo)).toEqual(cabecalho(original))
      expect(depois.csv.rows).toHaveLength(antes.csv.rows.length)

      const texto = depois.text
      for (const nome of ORIGINAIS) expect(texto).not.toContain(nome)
      expect(texto).not.toMatch(/529\.982\.247-25|exemplo\.org.*assuncao|jose\.assuncao/)
      for (const linha of depois.csv.rows)
        expect(isValidCpf(linha.cells[1]!.replace(/\D/g, ''))).toBe(true)
      // Carga horária não é dado pessoal e carrega o formato ("4,5").
      expect(depois.csv.rows.map((linha) => linha.cells[4])).toEqual(
        antes.csv.rows.map((linha) => linha.cells[4]),
      )
    },
  )

  it('o fim de linha e o formato de cada célula ficam: máscara do CPF, data dd/mm/aaaa', () => {
    const anonimo = anonymizeCsv(fixture('excel-ptbr-cp1252-semicolon.csv'), { seed: 1 })
    const { text, csv } = ler(anonimo)
    expect(text.split('\r\n')).toHaveLength(csv.rows.length + 2)
    for (const linha of csv.rows) {
      expect(linha.cells[1]).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
      expect(linha.cells[2]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    }
  })

  it('a mesma pessoa vira a mesma pessoa sintética: duplicata e homônimo continuam lá', () => {
    const { csv } = ler(anonymizeCsv(fixture('duplicates-in-file.csv'), { seed: 7 }))
    const [jose1, , jose2, jose3] = csv.rows.map((linha) => linha.cells)
    expect(jose2!.slice(0, 2)).toEqual(jose1!.slice(0, 2))
    expect(jose3).toEqual(jose1)
    // A coluna de tipo é categoria, não dado pessoal.
    expect(csv.rows.map((linha) => linha.cells[2])).toEqual([
      'Participante',
      'Participante',
      'Palestrante',
      'Participante',
    ])

    const homonimos = ler(anonymizeCsv(fixture('homonyms.csv'), { seed: 7 })).csv.rows
    expect(homonimos[0]!.cells[0]).toBe(homonimos[1]!.cells[0])
    expect(homonimos[0]!.cells[1]).not.toBe(homonimos[1]!.cells[1])
  })

  it('o CPF sem os zeros que o Excel comeu continua sem eles; a notação científica fica', () => {
    const zeros = ler(anonymizeCsv(fixture('cpf-leading-zeros-lost.csv'), { seed: 3 }))
      .csv.rows
    expect(zeros.map((linha) => linha.cells[1]!.length)).toEqual([9, 10])
    for (const linha of zeros)
      expect(isValidCpf(linha.cells[1]!.padStart(11, '0'))).toBe(true)

    const cientifica = ler(anonymizeCsv(fixture('cpf-scientific.csv'), { seed: 3 })).csv
      .rows
    expect(cientifica[0]!.cells[1]).toBe('1,23457E+10')
  })

  it('é determinístico pela semente', () => {
    const original = fixture('excel-ptbr-cp1252-semicolon.csv')
    expect(anonymizeCsv(original, { seed: 5 })).toEqual(
      anonymizeCsv(original, { seed: 5 }),
    )
    expect(anonymizeCsv(original, { seed: 5 })).not.toEqual(
      anonymizeCsv(original, { seed: 6 }),
    )
  })
})
