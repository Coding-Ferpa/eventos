/**
 * Sanitiza destinos de redirecionamento vindos da URL (`?proximo=`) ou do
 * callback de OAuth.
 *
 * Sem isso, um link como `/login?proximo=https://site-falso` levaria a pessoa
 * para fora do domínio logo depois de autenticar, o clássico open redirect.
 * Só passam caminhos internos.
 */

// Verificado por código do caractere em vez de regex: um caractere de controle
// literal no fonte é invisível na revisão e faz ferramentas tratarem o arquivo
// como binário.
function temCaractereDeControle(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function safeRedirectPath(value: string | null | undefined, fallback: string) {
  if (typeof value !== 'string' || value.length === 0) return fallback

  // `//evil.com` e `/\evil.com` são interpretados como URL absoluta pelo navegador.
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback

  // Quebra de linha abre espaço para header injection na resposta de redirect.
  if (temCaractereDeControle(value)) return fallback

  return value
}
