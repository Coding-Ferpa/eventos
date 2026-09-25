import { describe, expect, it } from 'vitest'

import { buildContentSecurityPolicy, staticSecurityHeaders } from '@/lib/security-headers'

function diretiva(csp: string, nome: string): string | undefined {
  return csp.split('; ').find((parte) => parte === nome || parte.startsWith(`${nome} `))
}

describe('buildContentSecurityPolicy', () => {
  it('autoriza scripts apenas pelo nonce quando a rota é dinâmica', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc123', isDev: false })

    expect(diretiva(csp, 'script-src')).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic'",
    )
  })

  it('sem nonce, permite os scripts inline do HTML pré-renderizado', () => {
    const csp = buildContentSecurityPolicy({ isDev: false })

    // `strict-dynamic` aqui bloquearia todo o JavaScript da página, o script
    // de tema inclusive (ADR-0012 do CF Jobs).
    expect(diretiva(csp, 'script-src')).toBe("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain('strict-dynamic')
  })

  it('bloqueia enquadramento, base-uri e objetos nos dois modos', () => {
    for (const csp of [
      buildContentSecurityPolicy({ isDev: false }),
      buildContentSecurityPolicy({ nonce: 'abc123', isDev: false }),
    ]) {
      expect(diretiva(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
      expect(diretiva(csp, 'object-src')).toBe("object-src 'none'")
      expect(diretiva(csp, 'base-uri')).toBe("base-uri 'self'")
      expect(diretiva(csp, 'form-action')).toBe("form-action 'self'")
      expect(diretiva(csp, 'default-src')).toBe("default-src 'self'")
    }
  })

  it('afrouxa só o necessário em desenvolvimento', () => {
    const dev = buildContentSecurityPolicy({ isDev: true })
    const prod = buildContentSecurityPolicy({ isDev: false })

    expect(diretiva(dev, 'script-src')).toContain("'unsafe-eval'")
    expect(diretiva(dev, 'connect-src')).toContain('ws:')
    expect(prod).not.toContain('unsafe-eval')
    expect(diretiva(prod, 'connect-src')).toBe("connect-src 'self'")
  })

  it('força HTTPS fora de desenvolvimento', () => {
    expect(buildContentSecurityPolicy({ isDev: false })).toContain(
      'upgrade-insecure-requests',
    )
    expect(buildContentSecurityPolicy({ isDev: true })).not.toContain(
      'upgrade-insecure-requests',
    )
  })

  it('libera a conexão com o Supabase só para quem a pede, que é o admin', () => {
    // O navegador do admin sobe a capa direto ao Storage, por URL assinada.
    const admin = buildContentSecurityPolicy({
      nonce: 'abc123',
      isDev: false,
      supabase: 'https://abc.supabase.co',
    })
    expect(diretiva(admin, 'connect-src')).toBe(
      "connect-src 'self' https://abc.supabase.co",
    )

    const publica = buildContentSecurityPolicy({ isDev: false })
    expect(diretiva(publica, 'connect-src')).toBe("connect-src 'self'")
  })

  it('não manda subir para HTTPS quem é servido em localhost', () => {
    // Em http://localhost não existe HTTPS para onde subir. O WebKit obedece
    // mesmo assim e pede o CSS e o JS por https://localhost, e a página sai
    // sem estilo e sem hidratar; o Chromium isenta o localhost.
    expect(buildContentSecurityPolicy({ isDev: false, localhost: true })).not.toContain(
      'upgrade-insecure-requests',
    )
    expect(buildContentSecurityPolicy({ isDev: false, localhost: false })).toContain(
      'upgrade-insecure-requests',
    )
  })
})

describe('staticSecurityHeaders', () => {
  it('recusa enquadramento e adivinhação de tipo', () => {
    const porChave = Object.fromEntries(
      staticSecurityHeaders.map((h) => [h.key, h.value]),
    )

    expect(porChave['X-Frame-Options']).toBe('DENY')
    expect(porChave['X-Content-Type-Options']).toBe('nosniff')
    expect(porChave['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(porChave['Strict-Transport-Security']).toContain('includeSubDomains')
  })
})
