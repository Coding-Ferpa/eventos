/**
 * Cabeçalhos de segurança da aplicação (doc 08, A05).
 *
 * Módulo puro de propósito: não importa nada de `next/*`, para servir tanto ao
 * `next.config.ts` quanto ao proxy, e para ser testado isoladamente.
 */

export type SecurityHeader = { key: string; value: string }

/**
 * Cabeçalhos fixos, aplicados a todas as rotas pelo `next.config.ts`. A CSP
 * não está aqui porque depende do nonce gerado por requisição.
 */
export const staticSecurityHeaders: SecurityHeader[] = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

export type ContentSecurityPolicyOptions = {
  /**
   * Nonce por requisição, que o Next reaproveita nos scripts que injeta. Só
   * existe em rota renderizada dinamicamente: em HTML pré-renderizado o Next
   * não tem como carimbá-lo, e `strict-dynamic` bloquearia todo o JavaScript
   * da página (ADR-0012 do CF Jobs). Quem passa nonce chega no M2, com
   * `/login` e `/admin`.
   */
  nonce?: string
  /** Em desenvolvimento o Next precisa de `unsafe-eval` (HMR e React Refresh). */
  isDev: boolean
}

const SELF = "'self'"

export function buildContentSecurityPolicy({
  nonce,
  isDev,
}: ContentSecurityPolicyOptions): string {
  const scriptSrc = nonce
    ? [SELF, `'nonce-${nonce}'`, "'strict-dynamic'"]
    : [SELF, "'unsafe-inline'"]
  if (isDev) scriptSrc.push("'unsafe-eval'")

  const connectSrc = [SELF]
  if (isDev) connectSrc.push('ws:')

  const directives: [string, string[]][] = [
    ['default-src', [SELF]],
    ['script-src', scriptSrc],
    // `next/font` e o Tailwind emitem <style> inline, e o Next não aplica
    // nonce em estilo.
    ['style-src', [SELF, "'unsafe-inline'"]],
    ['img-src', [SELF, 'blob:', 'data:', 'https:']],
    ['font-src', [SELF, 'data:']],
    ['connect-src', connectSrc],
    ['form-action', [SELF]],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', [SELF]],
    ['object-src', ["'none'"]],
  ]

  const policy = directives.map(([name, values]) => `${name} ${values.join(' ')}`)
  if (!isDev) policy.push('upgrade-insecure-requests')

  return policy.join('; ')
}
