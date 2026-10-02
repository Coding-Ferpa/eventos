/**
 * `pnpm fixtures:anonymize local/<arquivo>.csv [saida] [--semente N]`
 *
 * Deriva uma fixture da planilha real de um evento (docs 06 e 12). A planilha
 * real vive em `local/`, que está no `.gitignore`, e nunca entra no
 * repositório; a saída padrão é `tests/fixtures/csv/<nome>.anon.<extensão>`.
 *
 * Antes de gravar, confere a própria saída: se algum nome, e-mail ou CPF da
 * planilha original aparecer nela, aborta sem escrever nada.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { anonymizeCsv } from '../src/features/import/anonymize'
import { decodeBytes } from '../src/features/import/decode'
import { suggestMapping } from '../src/features/import/mapping'
import { parseCsv } from '../src/features/import/parse'

function falhar(mensagem: string): never {
  console.error(`✖ ${mensagem}`)
  process.exit(1)
}

const argumentos = process.argv.slice(2)
const indiceDaSemente = argumentos.indexOf('--semente')
const semente = indiceDaSemente >= 0 ? Number(argumentos[indiceDaSemente + 1]) : 2026
const [entrada, saidaPedida] =
  indiceDaSemente >= 0
    ? argumentos.filter((_, i) => i !== indiceDaSemente && i !== indiceDaSemente + 1)
    : argumentos
if (!entrada) falhar('Informe a planilha: pnpm fixtures:anonymize local/<arquivo>.csv')
if (!Number.isInteger(semente)) falhar('A semente precisa ser um número inteiro.')

const caminho = path.resolve(entrada)
if (!caminho.startsWith(path.resolve('local') + path.sep)) {
  falhar('A planilha real fica em local/, fora do repositório. Mova o arquivo para lá.')
}

const extensao = path.extname(caminho)
const saida = path.resolve(
  saidaPedida ??
    path.join(
      'tests/fixtures/csv',
      `${path.basename(caminho, extensao)}.anon${extensao}`,
    ),
)

const original = new Uint8Array(readFileSync(caminho))
const anonimo = anonymizeCsv(original, { seed: semente })

// A conferência: o que identifica alguém na original não pode estar na saída.
const lidoOriginal = parseCsv(decodeBytes(original).text)
if (!lidoOriginal.ok) falhar(`A planilha não abre: ${lidoOriginal.error.code}`)
const { headers, rows } = lidoOriginal.csv
const mapa = suggestMapping(headers, {
  multipleTypes: true,
  dataFields: [],
  preset: {},
  searchByCpf: false,
})
const textoDaSaida = decodeBytes(anonimo).text
const lidoSaida = parseCsv(textoDaSaida)
if (!lidoSaida.ok) falhar('A saída não abre como planilha. Nada foi gravado.')
// CPF célula a célula: os dígitos do arquivo inteiro emendados dariam falso positivo.
const digitosDaSaida = new Set(
  lidoSaida.csv.rows.flatMap((linha) => linha.cells.map((c) => c.replace(/\D/g, ''))),
)
const vazamentos: string[] = []
for (const alvo of ['full_name', 'email', 'cpf'] as const) {
  const coluna = mapa[alvo] ? headers.indexOf(mapa[alvo]!) : -1
  if (coluna < 0) continue
  for (const linha of rows) {
    const valor = (linha.cells[coluna] ?? '').trim()
    const vazou =
      alvo === 'cpf'
        ? valor.replace(/\D/g, '').length >= 9 &&
          digitosDaSaida.has(valor.replace(/\D/g, ''))
        : valor.length >= 5 && textoDaSaida.includes(valor)
    if (vazou) vazamentos.push(`${alvo} da linha ${linha.rowNumber}`)
  }
}
if (vazamentos.length > 0) {
  falhar(
    `A saída ainda contém dado da planilha original (${vazamentos.join(', ')}). Nada foi gravado.`,
  )
}

writeFileSync(saida, anonimo)
const decodificado = decodeBytes(anonimo)
console.log(
  `✔ ${path.relative(process.cwd(), saida)}: ${rows.length} linhas, ${decodificado.encoding}, ` +
    `colunas reconhecidas: ${Object.keys(mapa).join(', ') || 'nenhuma'}; semente ${semente}.`,
)
