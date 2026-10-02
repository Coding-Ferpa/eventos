/**
 * A regra do CPF em um lugar só: a importação, a busca pública e o guardrail
 * do conteúdo do certificado (doc 05) perguntam a mesma coisa. Recebe só
 * dígitos; tirar a máscara é de quem lê a entrada.
 */

export function isRepeatedDigits(digitos: string): boolean {
  return /^(\d)\1{10}$/.test(digitos)
}

function digitoVerificador(numeros: number[]): number {
  const peso = numeros.length + 1
  const soma = numeros.reduce((total, digito, i) => total + digito * (peso - i), 0)
  const resto = (soma * 10) % 11
  return resto === 10 ? 0 : resto
}

/** 11 dígitos, verificadores conferem, e não é sequência repetida (que passa na conta). */
export function isValidCpf(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos) || isRepeatedDigits(digitos)) return false
  const numeros = [...digitos].map(Number)
  return (
    digitoVerificador(numeros.slice(0, 9)) === numeros[9] &&
    digitoVerificador(numeros.slice(0, 10)) === numeros[10]
  )
}
