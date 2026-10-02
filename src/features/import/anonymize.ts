import Papa from 'papaparse'

import { decodeBytes, type Encoding } from './decode'
import { suggestMapping, type Target } from './mapping'
import { parseCsv } from './parse'

/**
 * `pnpm fixtures:anonymize` (docs 06 e 12): a planilha real vira fixture sem
 * nenhum dado pessoal e com as peculiaridades que davam valor a ela: encoding,
 * BOM, delimitador, fim de linha, cabeçalho, máscara do CPF, formato da data,
 * zeros que o Excel comeu, linhas vazias. Anonimizar no Excel não serve:
 * salvar de novo destrói justamente isso.
 *
 * Nome, CPF, e-mail e nascimento viram valores sintéticos do mesmo formato;
 * tipo e carga horária ficam (são categoria e formato, não pessoa); qualquer
 * outra coluna é embaralhada caractere a caractere, mantendo a classe de cada
 * um. O mesmo valor original vira sempre o mesmo valor sintético, então
 * duplicatas e homônimos continuam lá.
 */

/** Gerador determinístico (mulberry32): a mesma semente dá o mesmo arquivo. */
function sorteador(semente: number) {
  let estado = semente >>> 0
  const proximo = () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const inteiro = (min: number, max: number) =>
    min + Math.floor(proximo() * (max - min + 1))
  const um = <T>(lista: readonly T[]) => lista[inteiro(0, lista.length - 1)]!
  return { inteiro, um }
}

const SILABAS = [
  'ba',
  'be',
  'ca',
  'ço',
  'da',
  'dé',
  'fa',
  'gu',
  'já',
  'lo',
  'lu',
  'ma',
  'mô',
  'na',
  'ni',
  'pa',
  'pe',
  'ra',
  'ri',
  'sa',
  'sã',
  'ta',
  'te',
  'vi',
  'zé',
]
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
const MINUSCULAS_ACENTUADAS = 'áàâãéêíóôõúç'
const MAIUSCULAS_ACENTUADAS = 'ÁÀÂÃÉÊÍÓÔÕÚÇ'

function digitosVerificadores(base: string) {
  const calcular = (parcial: string) => {
    const soma = [...parcial].reduce(
      (s, d, i) => s + Number(d) * (parcial.length + 1 - i),
      0,
    )
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  const d1 = calcular(base)
  return `${base}${d1}${calcular(base + d1)}`
}

function mesmaCaixa(modelo: string, palavra: string) {
  if (modelo === modelo.toUpperCase() && modelo !== modelo.toLowerCase())
    return palavra.toUpperCase()
  if (modelo === modelo.toLowerCase()) return palavra.toLowerCase()
  return palavra
}

function criarAnonimizador(semente: number) {
  const s = sorteador(semente)
  const lembrados = new Map<string, string>()
  const usados = new Set<string>()
  const contador = { email: 0 }

  /** O mesmo original dá o mesmo sintético; sintéticos diferentes nunca colidem. */
  function lembrar(chave: string, gerar: () => string) {
    const existente = lembrados.get(chave)
    if (existente !== undefined) return existente
    let novo = gerar()
    while (usados.has(novo)) novo = gerar()
    usados.add(novo)
    lembrados.set(chave, novo)
    return novo
  }

  function palavra(original: string) {
    const sintetica = lembrar(`palavra:${original.toLowerCase()}`, () => {
      const texto = Array.from({ length: s.inteiro(2, 3) }, () => s.um(SILABAS)).join('')
      return texto[0]!.toUpperCase() + texto.slice(1)
    })
    return mesmaCaixa(original, sintetica)
  }

  function nome(original: string) {
    // Hífen e apóstrofo ficam: "Ana-Clara D’Ávila" continua com os dois.
    return original
      .split(/([\s\-'’]+)/)
      .map((parte) => {
        if (!/\p{L}/u.test(parte)) return parte
        if (parte.length <= 1 || PARTICULAS.has(parte.toLowerCase())) return parte
        return palavra(parte)
      })
      .join('')
  }

  function cpf(original: string) {
    if (/e\+?\d+$/i.test(original.trim())) return original
    const digitos = original.replace(/\D/g, '')
    if (![9, 10, 11].includes(digitos.length)) return embaralhar(original)
    const zeros = 11 - digitos.length
    const novo = lembrar(`cpf:${digitos}`, () => {
      const corpo =
        String(s.inteiro(1, 9)) +
        Array.from({ length: 8 - zeros }, () => s.inteiro(0, 9)).join('')
      return digitosVerificadores('0'.repeat(zeros) + corpo).slice(zeros)
    })
    let i = 0
    return original.replace(/\d/g, () => novo[i++]!)
  }

  function email(original: string) {
    if (!original.includes('@')) return embaralhar(original)
    const novo = lembrar(
      `email:${original.toLowerCase()}`,
      () => `pessoa${++contador.email}@exemplo.org`,
    )
    return original === original.toUpperCase() ? novo.toUpperCase() : novo
  }

  function nascimento(original: string) {
    return lembrar(`data:${original}`, () => {
      const dia = s.inteiro(1, 28)
      const mes = s.inteiro(1, 12)
      const ano = s.inteiro(1950, 2008)
      const br = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/.exec(original)
      if (br) {
        return `${String(dia).padStart(br[1]!.length, '0')}${br[2]}${String(mes).padStart(br[3]!.length, '0')}${br[2]}${ano}`
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(original)) {
        return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      }
      if (/^\d{5}$/.test(original)) return String(s.inteiro(18_000, 40_000))
      return embaralhar(original)
    })
  }

  function embaralhar(original: string) {
    return lembrar(`texto:${original}`, () =>
      [...original]
        .map((c) => {
          if (/[a-z]/.test(c)) return String.fromCharCode(s.inteiro(97, 122))
          if (/[A-Z]/.test(c)) return String.fromCharCode(s.inteiro(65, 90))
          if (/\d/.test(c)) return String(s.inteiro(0, 9))
          if (MINUSCULAS_ACENTUADAS.includes(c)) return s.um([...MINUSCULAS_ACENTUADAS])
          if (MAIUSCULAS_ACENTUADAS.includes(c)) return s.um([...MAIUSCULAS_ACENTUADAS])
          return c
        })
        .join(''),
    )
  }

  return { nome, cpf, email, nascimento, embaralhar }
}

// --- Bytes de volta, no mesmo encoding ---------------------------------------

const WINDOWS_1252_ALTO = new Map(
  [...'€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ'].map((c, i) => [
    c,
    0x80 + i,
  ]),
)

function codificar(texto: string, encoding: Encoding): Uint8Array {
  if (encoding === 'utf-8') return new TextEncoder().encode(texto)
  if (encoding === 'utf-8-bom')
    return new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(texto)])
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    const bytes = new Uint8Array(2 + texto.length * 2)
    const le = encoding === 'utf-16le'
    bytes.set(le ? [0xff, 0xfe] : [0xfe, 0xff])
    for (let i = 0; i < texto.length; i++) {
      const unidade = texto.charCodeAt(i)
      bytes[2 + i * 2] = le ? unidade & 0xff : unidade >> 8
      bytes[3 + i * 2] = le ? unidade >> 8 : unidade & 0xff
    }
    return bytes
  }
  return new Uint8Array(
    [...texto].map((c) => {
      const codigo = c.codePointAt(0)!
      if (codigo < 0x80 || (codigo >= 0xa0 && codigo <= 0xff)) return codigo
      const alto = WINDOWS_1252_ALTO.get(c)
      if (alto === undefined) throw new Error(`Caractere fora do Windows-1252: ${c}`)
      return alto
    }),
  )
}

// --- O arquivo ---------------------------------------------------------------

export function anonymizeCsv(bytes: Uint8Array, { seed }: { seed: number }): Uint8Array {
  const { text, encoding } = decodeBytes(bytes)
  const lido = parseCsv(text)
  if (!lido.ok) throw new Error(`O arquivo não abre como planilha: ${lido.error.code}`)
  const { delimiter, headers } = lido.csv

  const alvoDa = new Map<number, Target>()
  const sugestao = suggestMapping(headers, {
    multipleTypes: true,
    dataFields: [],
    preset: {},
    searchByCpf: false,
  })
  for (const [alvo, cabecalho] of Object.entries(sugestao))
    alvoDa.set(headers.indexOf(cabecalho!), alvo as Target)

  // Os registros como estão no arquivo, com as larguras originais e as linhas
  // vazias: o parse da importação os normaliza, e aqui isso apagaria o que se
  // quer guardar.
  const registros = Papa.parse<string[]>(text, {
    delimiter,
    header: false,
    skipEmptyLines: false,
  }).data
  const fim = text.includes('\r\n') ? '\r\n' : text.includes('\r') ? '\r' : '\n'
  const primeiraLinha =
    text.split(/\r\n|\n|\r/).find((linha) => linha.trim() !== '') ?? ''
  const aspasEmTudo =
    primeiraLinha.startsWith('"') && primeiraLinha.trimEnd().endsWith('"')
  const indiceDoCabecalho = registros.findIndex((celulas) =>
    celulas.some((c) => c.trim() !== ''),
  )

  const a = criarAnonimizador(seed)
  const trocar = (alvo: Target | undefined, valor: string) => {
    if (valor.trim() === '') return valor
    switch (alvo) {
      case 'full_name':
        return a.nome(valor)
      case 'cpf':
        return a.cpf(valor)
      case 'email':
        return a.email(valor)
      case 'birth_date':
        return a.nascimento(valor)
      case 'participation_type':
      case 'hours':
        return valor
      default:
        return a.embaralhar(valor)
    }
  }
  const celula = (valor: string) =>
    aspasEmTudo ||
    valor.includes(delimiter) ||
    valor.includes('"') ||
    /[\r\n]/.test(valor)
      ? `"${valor.replaceAll('"', '""')}"`
      : valor

  const linhas = registros.map((celulas, indice) => {
    if (indice <= indiceDoCabecalho) return celulas.map(celula).join(delimiter)
    return celulas
      .map((valor, coluna) => celula(trocar(alvoDa.get(coluna), valor)))
      .join(delimiter)
  })
  return codificar(linhas.join(fim), encoding)
}
