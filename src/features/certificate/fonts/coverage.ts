import type { FontMetrics } from './metrics'

/**
 * Cobertura de glifos exigida de toda fonte de certificado (doc 05): sem ela,
 * um nome como "Conceição" sairia com um quadrado no lugar de uma letra.
 */
export const REQUIRED_CHARACTERS = [
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
  'ÁÀÂÃÄÉÊËÍÏÓÔÕÖÚÜÇÑ',
  'áàâãäéêëíïóôõöúüçñ',
  'ªº°',
  '.,;:!?-/()\'"',
].join('')

export function checkCoverage(fonte: Pick<FontMetrics, 'missingCharacters'>) {
  const missing = fonte.missingCharacters(REQUIRED_CHARACTERS)
  return { ok: missing.length === 0, missing }
}

/**
 * Fonte variável (tabela `fvar`) é recusada: o pdf-lib embute a fonte como
 * ela é, sem instanciar o eixo de peso, e o 700 sairia como 400 sem erro.
 */
export function isVariableFont(fonte: {
  variationAxes: Record<string, unknown>
}): boolean {
  return Object.keys(fonte.variationAxes).length > 0
}
