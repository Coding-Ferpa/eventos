// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { decodeCsv } from './decode'

const fixture = (nome: string) =>
  new Uint8Array(readFileSync(path.resolve(process.cwd(), 'tests/fixtures/csv', nome)))

describe('decodeCsv', () => {
  it.each([
    ['excel-ptbr-cp1252-semicolon.csv', 'windows-1252'],
    ['excel-csv-utf8-bom-semicolon.csv', 'utf-8-bom'],
    ['google-sheets-utf8-comma.csv', 'utf-8'],
    ['excel-unicode-utf16le-tab.txt', 'utf-16le'],
  ] as const)('%s é %s, com os acentos certos', (arquivo, encoding) => {
    const { text, encoding: detectado, warnings } = decodeCsv(fixture(arquivo))
    expect(detectado).toBe(encoding)
    expect(text).toContain('José Gonçalves de Assunção')
    expect(text).toContain('Ângela Muñoz Ñandú')
    expect(warnings).toEqual([])
  })

  it('Windows-1252 de verdade, e não Latin-1: o 0x92 é o apóstrofo tipográfico', () => {
    // Em ISO-8859-1 o 0x92 seria um caractere de controle invisível.
    expect(decodeCsv(fixture('excel-ptbr-cp1252-semicolon.csv')).text).toContain(
      'Ana-Clara D’Ávila',
    )
  })

  it('o BOM sai do texto, para o primeiro cabeçalho não nascer com lixo', () => {
    for (const arquivo of [
      'excel-csv-utf8-bom-semicolon.csv',
      'excel-unicode-utf16le-tab.txt',
    ]) {
      expect(decodeCsv(fixture(arquivo)).text.startsWith('Nome completo')).toBe(true)
    }
  })

  it('UTF-16BE com BOM', () => {
    const conteudo = 'Nome\nJosé'
    const bytes = new Uint8Array(2 + conteudo.length * 2)
    bytes.set([0xfe, 0xff])
    for (let i = 0; i < conteudo.length; i++) {
      const cp = conteudo.charCodeAt(i)
      bytes[2 + i * 2] = cp >> 8
      bytes[3 + i * 2] = cp & 0xff
    }
    expect(decodeCsv(bytes)).toEqual({
      text: conteudo,
      encoding: 'utf-16be',
      warnings: [],
    })
  })

  it('ASCII puro decide UTF-8, sem erro', () => {
    expect(decodeCsv(fixture('ascii-only.csv'))).toMatchObject({
      encoding: 'utf-8',
      warnings: [],
    })
  })

  it('UTF-8 válido que já chegou estragado de outro sistema avisa MOJIBAKE_SUSPECTED', () => {
    expect(decodeCsv(fixture('mojibake-upstream.csv'))).toMatchObject({
      encoding: 'utf-8',
      warnings: ['MOJIBAKE_SUSPECTED'],
    })
  })

  it('caractere de substituição no texto também avisa', () => {
    const bytes = new TextEncoder().encode('Nome\nJos� Silva')
    expect(decodeCsv(bytes).warnings).toEqual(['MOJIBAKE_SUSPECTED'])
  })

  it('acento decomposto (NFD, como sai de um Mac) volta composto', () => {
    const decomposto = 'Nome\nConceição Araújo'
    const { text } = decodeCsv(new TextEncoder().encode(decomposto))
    expect(text).toBe('Nome\nConceição Araújo')
    expect(text).toBe(decomposto.normalize('NFC'))
  })

  it('arquivo vazio é UTF-8 vazio', () => {
    expect(decodeCsv(new Uint8Array())).toEqual({
      text: '',
      encoding: 'utf-8',
      warnings: [],
    })
  })
})
