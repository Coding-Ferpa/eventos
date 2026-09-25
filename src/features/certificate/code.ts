/**
 * Código de validação do certificado (doc 05): 10 símbolos do alfabeto
 * Crockford Base32, gerados no banco, exibidos como `XXXX-XXX-XXX`.
 *
 * O alfabeto não tem `I`, `L`, `O` nem `U`. Os três primeiros são lidos como
 * os algarismos com que se confundem no papel; o `U` não tem par e torna a
 * entrada malformada. Sem dígito verificador: "não encontrado, confira a
 * digitação" leva quem valida à mesma ação que um "dígito inválido".
 */

export const CODE_LENGTH = 10

const FORMA_CANONICA = /^[0-9A-HJKMNP-TV-Z]{10}$/
const SIMBOLO_VALIDO = /[0-9A-HJKMNP-TV-Z]/

const PARECIDOS: Record<string, string> = { O: '0', I: '1', L: '1' }

/**
 * Passos 1 a 3 do doc 05: maiúsculas, sem espaços e hífens, e os parecidos
 * trocados pelo algarismo. Não valida nada: o formulário usa o resultado
 * parcial para a máscara e para dizer o que está errado.
 */
export function canonicalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[OIL]/g, (letra) => PARECIDOS[letra] ?? letra)
}

export function isValidCode(code: string): boolean {
  return FORMA_CANONICA.test(code)
}

/** O código canônico, ou `null` quando a entrada não pode ser um código. */
export function normalizeCode(input: string): string | null {
  const code = canonicalizeCode(input)
  return isValidCode(code) ? code : null
}

/** `XXXX-XXX-XXX`. Aceita código pela metade, para a máscara do campo. */
export function formatCode(code: string): string {
  return [code.slice(0, 4), code.slice(4, 7), code.slice(7)]
    .filter((grupo) => grupo.length > 0)
    .join('-')
}

export type CodeDiagnosis =
  | { ok: true; code: string }
  | { ok: false; reason: 'symbol'; symbol: string }
  | { ok: false; reason: 'short'; missing: number }
  | { ok: false; reason: 'long'; extra: number }

/**
 * O que está errado na entrada, na ordem em que ajuda quem digita: primeiro o
 * símbolo que não existe, depois quanto falta ou sobra.
 */
export function diagnoseCode(input: string): CodeDiagnosis {
  const code = canonicalizeCode(input)

  const invalido = [...code].find((simbolo) => !SIMBOLO_VALIDO.test(simbolo))
  if (invalido) return { ok: false, reason: 'symbol', symbol: invalido }

  if (code.length < CODE_LENGTH) {
    return { ok: false, reason: 'short', missing: CODE_LENGTH - code.length }
  }
  if (code.length > CODE_LENGTH) {
    return { ok: false, reason: 'long', extra: code.length - CODE_LENGTH }
  }
  return { ok: true, code }
}
