// @vitest-environment node

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { decodeCsv } from './decode'
import { MAX_ROWS, parseCsv } from './parse'

const textoDa = (nome: string) =>
  decodeCsv(
    new Uint8Array(readFileSync(path.resolve(process.cwd(), 'tests/fixtures/csv', nome))),
  ).text

function lido(texto: string) {
  const resultado = parseCsv(texto)
  if (!resultado.ok) throw new Error(`parse falhou: ${resultado.error.code}`)
  return resultado.csv
}

const CABECALHO = [
  'Nome completo',
  'CPF',
  'Data de nascimento',
  'E-mail',
  'Carga horária',
]

describe('parseCsv', () => {
  it.each([
    ['excel-ptbr-cp1252-semicolon.csv', ';'],
    ['excel-csv-utf8-bom-semicolon.csv', ';'],
    ['google-sheets-utf8-comma.csv', ','],
    ['excel-unicode-utf16le-tab.txt', '\t'],
  ])(
    '%s: delimitador %j, o mesmo cabeçalho e as mesmas sete linhas',
    (arquivo, delimitador) => {
      const csv = lido(textoDa(arquivo))
      expect(csv.delimiter).toBe(delimitador)
      expect(csv.headers).toEqual(CABECALHO)
      expect(csv.rows).toHaveLength(7)
      expect(csv.rows[0]).toEqual({
        rowNumber: 2,
        cells: [
          'José Gonçalves de Assunção',
          '529.982.247-25',
          '12/09/1990',
          'jose.assuncao@exemplo.org',
          '8',
        ],
      })
      expect(csv.rows[2]!.cells[4]).toBe('4,5')
    },
  )

  it('delimitador dentro de aspas, quebra de linha dentro de campo e aspas escapadas', () => {
    const csv = lido(textoDa('quoted-delimiter-and-newline.csv'))
    expect(csv.delimiter).toBe(';')
    expect(csv.rows.map((linha) => linha.cells)).toEqual([
      ['Silva; Maria', 'primeira linha\r\nsegunda linha'],
      ['Pedro Alves', 'aspas "duplas" dentro'],
    ])
  })

  it('o número da linha é o do Excel: linha vazia no meio e antes do cabeçalho contam', () => {
    const csv = lido(
      '\r\nNome;Email\r\nAna Lima;ana@x.org\r\n;\r\n\r\nBia Souza;bia@x.org\r\n',
    )
    expect(csv.headers).toEqual(['Nome', 'Email'])
    expect(csv.rows.map((linha) => linha.rowNumber)).toEqual([3, 6])
  })

  it('o registro com quebra de linha dentro conta como uma linha, como no Excel', () => {
    const csv = lido('Nome;Obs\r\n"Ana Lima";"um\r\ndois"\r\nBia Souza;x\r\n')
    expect(csv.rows.map((linha) => linha.rowNumber)).toEqual([2, 3])
  })

  it('colunas finais totalmente vazias somem; cabeçalho repetido ganha sufixo', () => {
    const csv = lido('Nome;Nome;Email;;\r\nAna;Lima;a@x.org;;\r\n')
    expect(csv.headers).toEqual(['Nome', 'Nome (2)', 'Email'])
    expect(csv.rows[0]!.cells).toEqual(['Ana', 'Lima', 'a@x.org'])
  })

  it('cabeçalho vazio em coluna com dado vira "Coluna N"', () => {
    expect(lido('Nome;;Email\r\nAna;x;a@x.org\r\n').headers).toEqual([
      'Nome',
      'Coluna 2',
      'Email',
    ])
  })

  it('linha mais curta é completada; dado além do cabeçalho vira coluna, e não some calado', () => {
    const csv = lido('Nome;Email;Horas\r\nAna\r\nBia;b@x.org;8;sobra\r\n')
    expect(csv.headers).toEqual(['Nome', 'Email', 'Horas', 'Coluna 4'])
    expect(csv.rows.map((linha) => linha.cells)).toEqual([
      ['Ana', '', '', ''],
      ['Bia', 'b@x.org', '8', 'sobra'],
    ])
  })

  it('no empate, vale a ordem do doc 06: ponto e vírgula antes de vírgula', () => {
    expect(lido('Nome;Horas,decimal\nAna;4,5\n').delimiter).toBe(';')
  })

  it('barra vertical também é delimitador', () => {
    expect(lido('Nome|Email\nAna|a@x.org\n').delimiter).toBe('|')
  })

  it('uma coluna só é SINGLE_COLUMN, com a dica do delimitador', () => {
    expect(parseCsv('Nome\nAna Lima\nBia Souza\n')).toEqual({
      ok: false,
      error: {
        code: 'SINGLE_COLUMN',
        message: expect.stringMatching(/delimitador/),
      },
    })
  })

  it('sem linha de dados é EMPTY_FILE', () => {
    expect(parseCsv('Nome;Email\r\n')).toMatchObject({
      ok: false,
      error: { code: 'EMPTY_FILE' },
    })
    expect(parseCsv('')).toMatchObject({ ok: false, error: { code: 'EMPTY_FILE' } })
  })

  it(`mais de ${MAX_ROWS} linhas é TOO_MANY_ROWS`, () => {
    const texto = 'Nome;Email\n' + 'Ana Lima;a@x.org\n'.repeat(MAX_ROWS + 1)
    expect(parseCsv(texto)).toMatchObject({ ok: false, error: { code: 'TOO_MANY_ROWS' } })
    expect(parseCsv('Nome;Email\n' + 'Ana Lima;a@x.org\n'.repeat(MAX_ROWS)).ok).toBe(true)
  })
})
