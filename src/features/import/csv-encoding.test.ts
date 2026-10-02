// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { decodeCsv } from './decode'
import { parseCsv } from './parse'

/**
 * Gate do doc 11 (`pnpm test:gate:csv`, passo nomeado no CI): os quatro jeitos
 * reais de uma planilha chegar, e os mesmos nomes acentuados nos quatro. Nome
 * estragado na importação vira certificado estragado na mão de alguém.
 */

const NOMES = [
  'José Gonçalves de Assunção',
  'Maria Eduarda dos Santos Albuquerque',
  'Ângela Muñoz Ñandú',
  'João Pedro da Silva',
  'Ana-Clara D’Ávila',
  'Conceição Araújo Lima',
  'Luís Antônio Gonçalves',
]

const nomesDe = (arquivo: string) => {
  const bytes = new Uint8Array(
    readFileSync(path.resolve(process.cwd(), 'tests/fixtures/csv', arquivo)),
  )
  const lido = parseCsv(decodeCsv(bytes).text)
  if (!lido.ok) throw new Error(`${arquivo}: ${lido.error.code}`)
  return lido.csv.rows.map((linha) => linha.cells[0])
}

describe('gate: os mesmos nomes acentuados nos quatro formatos', () => {
  it.each([
    'excel-ptbr-cp1252-semicolon.csv',
    'excel-csv-utf8-bom-semicolon.csv',
    'google-sheets-utf8-comma.csv',
    'excel-unicode-utf16le-tab.txt',
  ])('%s', (arquivo) => {
    expect(nomesDe(arquivo)).toEqual(NOMES)
  })
})
