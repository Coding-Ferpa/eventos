import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { semBanco } from '@/lib/ambiente'
import {
  COOKIE_DE_DISPOSITIVO,
  OPCOES_DO_COOKIE_DE_DISPOSITIVO,
  criarCookieDeDispositivo,
  lerCookieDeDispositivo,
} from '@/lib/cookies/device'
import { serverEnv, supabaseEnv } from '@/lib/env'
import { buildContentSecurityPolicy } from '@/lib/security-headers'

/**
 * Rotas renderizadas dinamicamente e ligadas à sessão. Aqui, e só aqui, o
 * proxy renova o token do Supabase e o Next consegue carimbar o nonce da CSP
 * nos scripts (ADR-0012 do CF Jobs).
 *
 * A área pública fica de fora de propósito: ela é estática ou ISR e não
 * precisa de sessão, então não vale pagar uma ida ao serviço de auth por
 * visita.
 */
const ROTAS_DINAMICAS = ['/admin', '/login']

/**
 * Páginas em que o cookie de dispositivo nasce (doc 08): as que levam à
 * busca. O proxy só acrescenta o `Set-Cookie`, e a página continua saindo do
 * cache de ISR.
 */
const ROTAS_COM_DISPOSITIVO = /^\/($|eventos\/|validar(\/|$)|meus-certificados(\/|$))/

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const rotaDinamica = ROTAS_DINAMICAS.some((rota) => pathname.startsWith(rota))

  const nonce = rotaDinamica ? crypto.randomUUID().replaceAll('-', '') : undefined
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    localhost: ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname),
  })

  const requestHeaders = new Headers(request.headers)
  if (nonce) {
    // O Next lê a CSP dos headers da requisição para carimbar o nonce.
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('content-security-policy', csp)
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  if (!rotaDinamica) {
    garantirDispositivo(request, response)
    response.headers.set('content-security-policy', csp)
    return response
  }

  const env = supabaseEnv()
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request: { headers: requestHeaders } })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Renova a sessão e devolve um usuário verificado pelo servidor.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Só redireciona: quem autoriza de verdade é o guarda do layout do admin, a
  // cada renderização, e o `defineAction`, a cada escrita (doc 08).
  if (!user && pathname.startsWith('/admin')) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('proximo', pathname)
    return redirecionar(loginUrl, response, csp)
  }

  if (user && pathname.startsWith('/login')) {
    const adminUrl = request.nextUrl.clone()
    adminUrl.pathname = '/admin'
    adminUrl.search = ''
    return redirecionar(adminUrl, response, csp)
  }

  response.headers.set('content-security-policy', csp)
  return response
}

/**
 * Emite o cookie de dispositivo quando ele falta ou não vale mais (vencido,
 * forjado, segredo trocado). Na primeira visita, e não na primeira busca: se
 * nascesse com a busca, a primeira tentativa de todo mundo cairia no balde de
 * IP, justo no pico do evento (ADR-0006).
 */
function garantirDispositivo(request: NextRequest, response: NextResponse) {
  // Sem banco não há busca nem rate limit para o cookie servir (ADR-0014).
  if (semBanco() || !ROTAS_COM_DISPOSITIVO.test(request.nextUrl.pathname)) return

  const segredo = serverEnv().DEVICE_COOKIE_SECRET
  const atual = request.cookies.get(COOKIE_DE_DISPOSITIVO)?.value
  if (lerCookieDeDispositivo(atual, segredo)) return

  response.cookies.set(
    COOKIE_DE_DISPOSITIVO,
    criarCookieDeDispositivo(segredo),
    OPCOES_DO_COOKIE_DE_DISPOSITIVO,
  )
}

/** Leva junto os cookies renovados: perdê-los derrubaria a sessão recém-criada. */
function redirecionar(destino: URL, origem: NextResponse, csp: string) {
  const redirect = NextResponse.redirect(destino)
  for (const cookie of origem.cookies.getAll()) {
    redirect.cookies.set(cookie)
  }
  redirect.headers.set('content-security-policy', csp)
  return redirect
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
