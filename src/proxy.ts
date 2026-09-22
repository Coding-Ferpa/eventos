import { NextResponse, type NextRequest } from 'next/server'

import { buildContentSecurityPolicy } from '@/lib/security-headers'

/**
 * Carimba a CSP em toda resposta (doc 08). A política fica aqui, e não no
 * `next.config.ts` junto dos cabeçalhos fixos, porque ela depende de um nonce
 * por requisição assim que existir rota dinâmica.
 *
 * Hoje todas as rotas são pré-renderizadas, então nenhum nonce é emitido: em
 * HTML estático o Next não tem como carimbá-lo, e `strict-dynamic` bloquearia
 * todo o JavaScript da página, o script de tema inclusive. O nonce e o
 * redirecionamento de `/admin` chegam no M2, com a sessão; o cookie de
 * dispositivo, no M3.
 */
export function proxy(request: NextRequest) {
  const csp = buildContentSecurityPolicy({
    isDev: process.env.NODE_ENV === 'development',
  })

  const response = NextResponse.next({ request })
  response.headers.set('content-security-policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
