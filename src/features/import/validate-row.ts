import {
  buildDataSchema,
  dataIssueCode,
  parseDate,
  parseHours,
  type DataValue,
} from '@/features/certificate/data-schema'
import type { DataField } from '@/features/certificate/schema'
import { z } from '@/lib/zod'

import { parseCpfCell } from './cpf'
import { normalizeHeader, type Mapping } from './mapping'

/**
 * Validação de uma linha (doc 06). Pura: o HMAC do CPF chega pronto no
 * contexto, e o CPF em claro não sai daqui.
 *
 * O que depende do nome normalizado pelo banco (nome curto, palavra única,
 * duplicata no arquivo, homônimo, possível duplicata) é do SQL: uma
 * aproximação aqui deixaria passar uma linha que o `check` de `participants`
 * recusa, e a aplicação inteira cairia por ela.
 */

export type RowIssueCode =
  | 'NAME_REQUIRED'
  | 'NAME_TOO_LONG'
  | 'CPF_INVALID'
  | 'CPF_REPEATED_DIGITS'
  | 'CPF_SCIENTIFIC_NOTATION'
  | 'DATE_UNRECOGNIZED'
  | 'DATE_IMPLAUSIBLE'
  | 'EMAIL_INVALID'
  | 'HOURS_INVALID'
  | 'TYPE_UNKNOWN'
  | 'TYPE_WITHOUT_TEMPLATE'
  | 'FIELD_REQUIRED'
  | 'FIELD_INVALID'
  | 'FIELD_TOO_LONG'
  | 'CONTENT_LOOKS_LIKE_CPF'
  | 'FIELD_NOT_IN_TEMPLATE'
  | 'NO_SEARCHABLE_KEY'
  // Medido na prévia, com o motor e as fontes (name-fit-warnings.ts).
  | 'LAYOUT_BELOW_MIN_SIZE'

export type RowIssue = {
  code: RowIssueCode
  severity: 'error' | 'warning'
  field?: string
  detail: string
}

export type ImportType = {
  id: string
  slug: string
  label: string
  aliases: string[]
  /** Nulo quando o tipo não tem modelo. */
  dataFields: DataField[] | null
}

export type ValidateContext = {
  types: ImportType[]
  /** O tipo do lote no modo tipo único; nulo quando a planilha tem coluna de tipo. */
  fixedTypeId: string | null
  search: {
    byCpf: boolean
    byEmail: boolean
    byName: boolean
    birthDate: boolean
    mode: 'any' | 'all'
  }
  hashCpf: (cpf: string) => string
  today: Date
}

export type StagedRow = {
  rowNumber: number
  participationTypeId: string | null
  fullName: string | null
  cpfHash: string | null
  cpfLast3: string | null
  birthDate: string | null
  email: string | null
  hours: number | null
  /** Só o que veio preenchido: na atualização, o resto não é tocado. */
  data: Record<string, DataValue>
  /** O `default` dos campos que vieram vazios: só para o certificado novo. */
  dataDefaults: Record<string, DataValue>
  issues: RowIssue[]
}

const EMAIL_MAXIMO = 254
const emailSchema = z.email()

// Um schema por campo, reaproveitado entre as linhas: 5.000 linhas com 20
// campos não constroem 100 mil schemas.
const schemasPorCampo = new WeakMap<DataField, z.ZodType<Record<string, DataValue>>>()
function schemaDoCampo(campo: DataField) {
  let schema = schemasPorCampo.get(campo)
  if (!schema) {
    schema = buildDataSchema([campo])
    schemasPorCampo.set(campo, schema)
  }
  return schema
}

function limiteDeNascimento(hoje: Date): string {
  const limite = new Date(
    Date.UTC(hoje.getUTCFullYear() - 5, hoje.getUTCMonth(), hoje.getUTCDate()),
  )
  return limite.toISOString().slice(0, 10)
}

function encontrarTipo(valor: string, tipos: ImportType[]): ImportType | undefined {
  const procurado = normalizeHeader(valor)
  if (procurado === '') return undefined
  return tipos.find((tipo) =>
    [tipo.slug, tipo.label, ...tipo.aliases].some(
      (nome) => normalizeHeader(nome) === procurado,
    ),
  )
}

export type Identity = Pick<
  StagedRow,
  'fullName' | 'cpfHash' | 'cpfLast3' | 'birthDate' | 'email' | 'issues'
>

/**
 * Os quatro campos de identidade. É a mesma validação na importação, na
 * edição manual e na criação manual de uma pessoa (doc 07), e o CPF em claro
 * também não sai daqui.
 */
export function validateIdentity(
  cells: Pick<Mapping, 'full_name' | 'cpf' | 'birth_date' | 'email'>,
  ctx: Pick<ValidateContext, 'hashCpf' | 'today'>,
): Identity {
  const issues: RowIssue[] = []
  const erro = (code: RowIssueCode, detail: string, field: string) =>
    issues.push({ code, severity: 'error', detail, field })
  const celula = (alvo: keyof typeof cells) => (cells[alvo] ?? '').trim()

  const fullName = celula('full_name').replace(/\s+/g, ' ') || null
  if (fullName === null) erro('NAME_REQUIRED', 'Falta o nome.', 'full_name')
  else if (fullName.length > 120)
    erro('NAME_TOO_LONG', 'O nome pode ter até 120 caracteres.', 'full_name')

  let cpfHash: string | null = null
  let cpfLast3: string | null = null
  const cpf = parseCpfCell(celula('cpf'))
  if (!cpf.ok) {
    const detalhe = {
      CPF_INVALID: 'CPF inválido: os dígitos verificadores não conferem.',
      CPF_REPEATED_DIGITS: 'CPF inválido: todos os dígitos iguais.',
      CPF_SCIENTIFIC_NOTATION:
        'O CPF chegou como número científico. Formate a coluna de CPF como texto na planilha e exporte de novo.',
    }[cpf.code]
    erro(cpf.code, detalhe, 'cpf')
  } else if (cpf.cpf !== null) {
    cpfHash = ctx.hashCpf(cpf.cpf)
    cpfLast3 = cpf.cpf.slice(-3)
  }

  let birthDate: string | null = null
  if (celula('birth_date') !== '') {
    const data = parseDate(celula('birth_date'))
    if (data === null) {
      erro(
        'DATE_UNRECOGNIZED',
        'Data de nascimento fora dos formatos aceitos, como 12/09/1990.',
        'birth_date',
      )
    } else if (data < '1900-01-01' || data > limiteDeNascimento(ctx.today)) {
      erro(
        'DATE_IMPLAUSIBLE',
        'Data de nascimento improvável: confira o ano.',
        'birth_date',
      )
    } else {
      birthDate = data
    }
  }

  let email: string | null = null
  if (celula('email') !== '') {
    const valor = celula('email').toLowerCase()
    if (valor.length > EMAIL_MAXIMO || !emailSchema.safeParse(valor).success) {
      erro('EMAIL_INVALID', 'E-mail inválido.', 'email')
    } else {
      email = valor
    }
  }

  return { fullName, cpfHash, cpfLast3, birthDate, email, issues }
}

export function validateRow(
  rowNumber: number,
  cells: Mapping,
  ctx: ValidateContext,
): StagedRow {
  const { fullName, cpfHash, cpfLast3, birthDate, email, issues } = validateIdentity(
    cells,
    ctx,
  )
  const erro = (code: RowIssueCode, detail: string, field?: string) =>
    issues.push({ code, severity: 'error', detail, ...(field ? { field } : {}) })
  const celula = (alvo: keyof Mapping) => (cells[alvo] ?? '').trim()

  let hours: number | null = null
  if (celula('hours') !== '') {
    hours = parseHours(celula('hours'))
    if (hours === null)
      erro(
        'HOURS_INVALID',
        'Carga horária inválida: use um número de 0 a 9.999,9, como 8 ou 1,5.',
      )
  }

  const tipo =
    ctx.fixedTypeId === null
      ? encontrarTipo(celula('participation_type'), ctx.types)
      : ctx.types.find((candidato) => candidato.id === ctx.fixedTypeId)
  if (!tipo)
    erro(
      'TYPE_UNKNOWN',
      'O tipo de participação não corresponde a nenhum tipo do evento.',
    )
  else if (tipo.dataFields === null)
    erro('TYPE_WITHOUT_TEMPLATE', `O tipo ${tipo.label} ainda não tem modelo.`)

  const data: Record<string, DataValue> = {}
  const dataDefaults: Record<string, DataValue> = {}
  const campos = tipo?.dataFields ?? null
  if (campos !== null) {
    for (const campo of campos) {
      const valor = celula(`data.${campo.key}`)
      if (valor === '') {
        if (campo.default !== null) {
          const padrao = schemaDoCampo(campo).safeParse({ [campo.key]: '' })
          if (padrao.success && padrao.data[campo.key] !== undefined) {
            dataDefaults[campo.key] = padrao.data[campo.key]!
          }
        } else if (campo.required) {
          erro('FIELD_REQUIRED', `Falta ${campo.label}.`, campo.key)
        }
        continue
      }
      const resultado = schemaDoCampo(campo).safeParse({ [campo.key]: valor })
      if (resultado.success) {
        data[campo.key] = resultado.data[campo.key]!
      } else {
        const problema = resultado.error.issues[0]!
        erro(dataIssueCode(problema) ?? 'FIELD_INVALID', problema.message, campo.key)
      }
    }

    const declaradas = new Set(campos.map((campo) => campo.key))
    for (const [alvo, valor] of Object.entries(cells)) {
      const chave = alvo.startsWith('data.') ? alvo.slice('data.'.length) : null
      if (chave !== null && !declaradas.has(chave) && (valor ?? '').trim() !== '') {
        issues.push({
          code: 'FIELD_NOT_IN_TEMPLATE',
          severity: 'warning',
          field: chave,
          detail: `O modelo de ${tipo!.label} não tem o campo ${chave}: o valor foi ignorado.`,
        })
      }
    }
  }

  if (!issues.some((problema) => problema.severity === 'error')) {
    const { search } = ctx
    const porNome = fullName !== null && (!search.birthDate || birthDate !== null)
    const chaves = [
      [search.byCpf, cpfHash !== null],
      [search.byEmail, email !== null],
      [search.byName, porNome],
    ].filter(([habilitada]) => habilitada)
    const encontravel =
      search.mode === 'all'
        ? chaves.every(([, presente]) => presente)
        : chaves.some(([, presente]) => presente)
    if (!encontravel) {
      issues.push({
        code: 'NO_SEARCHABLE_KEY',
        severity: 'warning',
        detail:
          'Esta pessoa não tem nenhum dos dados que o evento usa na busca: não conseguirá retirar o certificado sozinha.',
      })
    }
  }

  return {
    rowNumber,
    participationTypeId: tipo?.id ?? null,
    fullName,
    cpfHash,
    cpfLast3,
    birthDate,
    email,
    hours,
    data,
    dataDefaults,
    issues,
  }
}
