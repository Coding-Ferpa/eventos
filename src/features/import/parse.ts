import Papa from 'papaparse'

/**
 * Parse do texto já decodificado (doc 06). Aspas, delimitador dentro de aspas
 * e quebra de linha dentro de campo são problema do Papa Parse; o resto é
 * nosso: cabeçalho, colunas vazias no fim, nomes repetidos e numeração.
 *
 * O número de cada linha é o do Excel, para o admin achar a linha do erro na
 * própria planilha. Por isso o parse não pula linha vazia (o `skipEmptyLines`
 * do Papa deslocaria a numeração): as vazias são ignoradas aqui, contando.
 */

export const MAX_ROWS = 5000

export type Delimiter = ';' | ',' | '\t' | '|'
export type CsvRow = { rowNumber: number; cells: string[] }
export type ParsedCsv = { delimiter: Delimiter; headers: string[]; rows: CsvRow[] }

export type ParseErrorCode = 'SINGLE_COLUMN' | 'EMPTY_FILE' | 'TOO_MANY_ROWS'
export type ParseResult =
  | { ok: true; csv: ParsedCsv }
  | { ok: false; error: { code: ParseErrorCode; message: string } }

/** Na ordem de preferência do doc 06, para o empate. */
const DELIMITADORES: Delimiter[] = [';', ',', '\t', '|']

const vazia = (celulas: string[]) => celulas.every((celula) => celula.trim() === '')

function falha(code: ParseErrorCode, message: string): ParseResult {
  return { ok: false, error: { code, message } }
}

/**
 * O palpite do Papa mede a consistência do número de colunas entre as
 * linhas, e linha vazia (uma coluna só) derruba a conta. Por isso ele adivinha
 * pulando as vazias, nas primeiras linhas, e o parse de verdade vem depois,
 * com o delimitador fixo e sem pular nada.
 */
function adivinharDelimitador(texto: string): Delimiter {
  const { meta } = Papa.parse<string[]>(texto, {
    delimiter: '',
    delimitersToGuess: DELIMITADORES,
    skipEmptyLines: 'greedy',
    preview: 50,
  })
  return DELIMITADORES.includes(meta.delimiter as Delimiter)
    ? (meta.delimiter as Delimiter)
    : ';'
}

export function parseCsv(texto: string): ParseResult {
  const delimiter = adivinharDelimitador(texto)
  const { data } = Papa.parse<string[]>(texto, {
    delimiter,
    header: false,
    skipEmptyLines: false,
  })

  // O índice do registro mais um é a linha do Excel; registro com quebra de
  // linha entre aspas é uma linha lá também.
  const registros = data.map((celulas, indice) => ({ rowNumber: indice + 1, celulas }))
  const comDado = registros.filter((registro) => !vazia(registro.celulas))
  const [cabecalho, ...linhas] = comDado
  if (!cabecalho || linhas.length === 0) {
    return falha('EMPTY_FILE', 'O arquivo não tem linhas de dados depois do cabeçalho.')
  }
  if (linhas.length > MAX_ROWS) {
    return falha(
      'TOO_MANY_ROWS',
      `O arquivo tem ${linhas.length} linhas, e o limite é ${MAX_ROWS}. Divida em mais de um arquivo.`,
    )
  }

  // Coluna final sem cabeçalho e sem nenhum dado é o ";" que sobra no fim da
  // linha do Excel.
  let largura = Math.max(...comDado.map((registro) => registro.celulas.length))
  while (
    largura > 0 &&
    comDado.every((registro) => !(registro.celulas[largura - 1] ?? '').trim())
  ) {
    largura--
  }
  if (largura < 2) {
    return falha(
      'SINGLE_COLUMN',
      'Só uma coluna foi encontrada. Confira o delimitador: exporte como CSV separado por ponto e vírgula ou por vírgula.',
    )
  }

  const vistos = new Map<string, number>()
  const headers = Array.from({ length: largura }, (_, i) => {
    const nome = (cabecalho.celulas[i] ?? '').trim() || `Coluna ${i + 1}`
    const vezes = (vistos.get(nome) ?? 0) + 1
    vistos.set(nome, vezes)
    return vezes === 1 ? nome : `${nome} (${vezes})`
  })

  return {
    ok: true,
    csv: {
      delimiter,
      headers,
      rows: linhas.map((linha) => ({
        rowNumber: linha.rowNumber,
        cells: Array.from({ length: largura }, (_, i) => linha.celulas[i] ?? ''),
      })),
    },
  }
}
