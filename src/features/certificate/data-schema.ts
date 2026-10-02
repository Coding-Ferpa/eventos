import { z } from '@/lib/zod'

import { looksLikeCpf } from './reserved-keys'
import type { DataField } from './schema'

/**
 * `buildDataSchema(dataFields)` gera o Zod do payload de `certificates.data`
 * (doc 05). É ele que a importação usa para validar cada linha contra o modelo
 * daquela linha (doc 06), e cada erro traz o código de linha do doc 06 em
 * `params.code`, lido por `dataIssueCode`.
 *
 * O que sai é o valor normalizado: texto sem espaço nas pontas, número e horas
 * como número, data como `aaaa-mm-dd`. A formatação para o certificado é do
 * `format.ts`, na hora de desenhar.
 */

export type DataIssueCode =
  'FIELD_REQUIRED' | 'FIELD_INVALID' | 'FIELD_TOO_LONG' | 'CONTENT_LOOKS_LIKE_CPF'

export type DataValue = string | number

const EXCEL_EPOCA_UTC = Date.UTC(1899, 11, 30)
const DIA_MS = 24 * 60 * 60 * 1000

function dataIso(ano: number, mes: number, dia: number): string | null {
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  // Date.UTC aceita 31/02 e vira 03/03: a volta confere que a data existe.
  if (
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null
  }
  return data.toISOString().slice(0, 10)
}

/**
 * `dd/mm/aaaa`, `dd-mm-aaaa`, `dd.mm.aaaa`, `aaaa-mm-dd` e o número de série
 * do Excel (de 10000 a 60000). Ano com 2 dígitos é recusado, e `mm/dd` nunca
 * é presumido (doc 06).
 */
export function parseDate(texto: string): string | null {
  const valor = texto.trim()

  const brasileira = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(valor)
  if (brasileira)
    return dataIso(Number(brasileira[3]), Number(brasileira[2]), Number(brasileira[1]))

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  if (iso) return dataIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  if (/^\d{5}$/.test(valor)) {
    const serie = Number(valor)
    if (serie < 10_000 || serie > 60_000) return null
    return new Date(EXCEL_EPOCA_UTC + serie * DIA_MS).toISOString().slice(0, 10)
  }

  return null
}

function decimal(texto: string, casas: number): number | null {
  const casamento = /^(-?\d+)(?:[.,](\d+))?$/.exec(texto.trim())
  if (!casamento) return null
  if ((casamento[2]?.length ?? 0) > casas) return null
  return Number(`${casamento[1]}.${casamento[2] ?? '0'}`)
}

/** `8`, `8,5`, `8.5`, `8h`, `8 horas`: de 0 a 9999,9, com uma casa decimal. */
export function parseHours(texto: string): number | null {
  const semUnidade = texto.trim().replace(/\s*(h|hs|hora|horas)$/i, '')
  const horas = decimal(semUnidade, 1)
  if (horas === null || horas < 0 || horas > 9999.9) return null
  return horas
}

function recusar(ctx: z.RefinementCtx, code: DataIssueCode, message: string): never {
  ctx.addIssue({ code: 'custom', message, params: { code } })
  return z.NEVER as never
}

function normalizar(campo: DataField, bruto: unknown, ctx: z.RefinementCtx) {
  const texto = bruto === undefined || bruto === null ? '' : String(bruto).trim()
  const valor = texto === '' ? (campo.default ?? '') : texto

  if (valor === '') {
    return campo.required
      ? recusar(ctx, 'FIELD_REQUIRED', `Falta ${campo.label}.`)
      : undefined
  }

  // Guardrail do CPF, segunda barreira: vale para qualquer tipo de campo.
  if (looksLikeCpf(valor)) {
    return recusar(
      ctx,
      'CONTENT_LOOKS_LIKE_CPF',
      `${campo.label} parece um CPF, e CPF nunca vai no conteúdo do certificado.`,
    )
  }

  const invalido = (esperado: string) =>
    recusar(ctx, 'FIELD_INVALID', `${campo.label} precisa ser ${esperado}.`)

  switch (campo.format.type) {
    case 'text':
      if (valor.length > campo.format.max_length) {
        return recusar(
          ctx,
          'FIELD_TOO_LONG',
          `${campo.label} pode ter até ${campo.format.max_length} caracteres.`,
        )
      }
      return valor
    case 'number':
      return decimal(valor, campo.format.decimals) ?? invalido('um número')
    case 'date':
      return parseDate(valor) ?? invalido('uma data, como 12/09/2026')
    case 'hours':
      return parseHours(valor) ?? invalido('uma carga horária, como 8 ou 1,5')
  }
}

export function buildDataSchema(dataFields: DataField[]) {
  const forma: Record<string, z.ZodType<DataValue | undefined>> = {}
  for (const campo of dataFields) {
    forma[campo.key] = z
      .unknown()
      .transform((bruto, ctx) => normalizar(campo, bruto, ctx))
  }
  // Chave ausente vale como célula vazia. Sem isto, o Zod 4 não roda a
  // transformação de chave ausente e devolve `nonoptional` no lugar do padrão.
  const comTodasAsChaves = (entrada: unknown) => {
    if (typeof entrada !== 'object' || entrada === null) return entrada
    const completa: Record<string, unknown> = { ...entrada }
    for (const campo of dataFields) completa[campo.key] ??= ''
    return completa
  }
  // Chave que o modelo não declara não entra: é assim que um CPF numa coluna
  // não mapeada fica fora de `certificates.data`.
  return z
    .preprocess(comTodasAsChaves, z.object(forma))
    .transform((dados) =>
      Object.fromEntries(
        Object.entries(dados).filter(([, valor]) => valor !== undefined),
      ),
    ) as z.ZodType<Record<string, DataValue>>
}

/** O código de linha do doc 06 de um erro do `buildDataSchema`. */
export function dataIssueCode(issue: z.core.$ZodIssue): DataIssueCode | null {
  const params =
    'params' in issue ? (issue.params as { code?: DataIssueCode } | undefined) : undefined
  return params?.code ?? null
}
