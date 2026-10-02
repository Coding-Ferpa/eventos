import { isRepeatedDigits, isValidCpf } from '@/lib/cpf'

/**
 * A célula de CPF como a planilha a entrega (doc 06). O resultado ainda é o
 * CPF em claro: quem o transforma em HMAC é a validação da linha, e ele não
 * sai de lá.
 */

export type CpfIssueCode =
  'CPF_INVALID' | 'CPF_REPEATED_DIGITS' | 'CPF_SCIENTIFIC_NOTATION'
export type CpfCell = { ok: true; cpf: string | null } | { ok: false; code: CpfIssueCode }

// "1,23457E+10": o Excel mostrou o CPF como número e o exportou assim. Os
// dígitos perdidos não voltam.
const CIENTIFICA = /^\d+(?:[.,]\d+)?e\+?\d+$/i

export function parseCpfCell(texto: string): CpfCell {
  const valor = texto.trim()
  if (valor === '') return { ok: true, cpf: null }
  if (CIENTIFICA.test(valor)) return { ok: false, code: 'CPF_SCIENTIFIC_NOTATION' }
  // Máscara e separadores, sim; texto em volta, não: não adivinhamos.
  if (!/^[\d.\-/\s]+$/.test(valor)) return { ok: false, code: 'CPF_INVALID' }

  let digitos = valor.replace(/\D/g, '')
  // O Excel come o zero à esquerda de coluna numérica.
  if (digitos.length === 9 || digitos.length === 10) digitos = digitos.padStart(11, '0')

  if (isRepeatedDigits(digitos)) return { ok: false, code: 'CPF_REPEATED_DIGITS' }
  if (!isValidCpf(digitos)) return { ok: false, code: 'CPF_INVALID' }
  return { ok: true, cpf: digitos }
}
