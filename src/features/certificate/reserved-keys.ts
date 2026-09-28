/**
 * Guardrail inegociável do doc 05: CPF nunca é conteúdo do certificado. Duas
 * barreiras, porque uma só falha.
 *
 * 1. Na chave (e no rótulo) de um `data_field`: a identidade tem colunas
 *    próprias no participante, e o modelo não pode inventar outra.
 * 2. No valor, na importação: pega o admin que chamou o campo de "registro"
 *    e mandou o CPF dentro dele.
 */

const RESERVADAS = new Set([
  'cpf',
  'nome',
  'name',
  'fullname',
  'nomecompleto',
  'email',
  'nascimento',
  'datanascimento',
  'datadenascimento',
  'birthdate',
  'rg',
  'documento',
])

/** Sem acento, minúsculas, sem `_`, `-` e espaço. */
export function normalizeKey(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
}

export function isReservedKey(chaveOuRotulo: string): boolean {
  const normalizada = normalizeKey(chaveOuRotulo)
  return RESERVADAS.has(normalizada) || normalizada.includes('cpf')
}

function digitoVerificador(digitos: number[], pesoInicial: number): number {
  const soma = digitos.reduce((total, digito, i) => total + digito * (pesoInicial - i), 0)
  const resto = (soma * 10) % 11
  return resto === 10 ? 0 : resto
}

/**
 * O valor, reduzido a dígitos, tem 11 dígitos e verificadores de CPF válidos?
 * Número de 11 dígitos com verificador errado não conta: é só um número.
 */
export function looksLikeCpf(valor: string): boolean {
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false

  const numeros = [...digitos].map(Number)
  return (
    digitoVerificador(numeros.slice(0, 9), 10) === numeros[9] &&
    digitoVerificador(numeros.slice(0, 10), 11) === numeros[10]
  )
}
