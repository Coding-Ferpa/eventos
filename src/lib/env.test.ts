import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseClientEnv, parseServerEnv } from './env'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseClientEnv', () => {
  it('aceita a URL do site e devolve o valor tipado', () => {
    expect(
      parseClientEnv({ NEXT_PUBLIC_SITE_URL: 'https://eventos.example.org' }),
    ).toEqual({ NEXT_PUBLIC_SITE_URL: 'https://eventos.example.org' })
  })

  it('recusa configuração faltando, dizendo qual variável e o que fazer', () => {
    expect(() => parseClientEnv({})).toThrowError(/NEXT_PUBLIC_SITE_URL/)
    expect(() => parseClientEnv({})).toThrowError(/\.env\.example/)
  })

  it('recusa valor que não é URL', () => {
    expect(() =>
      parseClientEnv({ NEXT_PUBLIC_SITE_URL: 'eventos.example.org' }),
    ).toThrow()
  })

  it('trata variável em branco como ausente, e não como valor vazio', () => {
    // `VARIAVEL=` em um arquivo .env significa "não informei". Sem isto, a
    // mensagem de erro falaria de formato em vez de falar de ausência.
    expect(() => parseClientEnv({ NEXT_PUBLIC_SITE_URL: '   ' })).toThrowError(
      /NEXT_PUBLIC_SITE_URL/,
    )
  })

  describe('endereço local na Vercel', () => {
    it('passa fora da Vercel, que é onde localhost faz sentido', () => {
      expect(() =>
        parseClientEnv({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
      ).not.toThrow()
    })

    it('recusa dentro da Vercel, explicando o que colar no lugar', () => {
      vi.stubEnv('VERCEL', '1')

      expect(() =>
        parseClientEnv({ NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000' }),
      ).toThrowError(/não existe dentro da Vercel/)
    })

    it('não atrapalha uma URL pública de verdade na Vercel', () => {
      vi.stubEnv('VERCEL', '1')

      expect(() =>
        parseClientEnv({ NEXT_PUBLIC_SITE_URL: 'https://eventos.codingferpa.org' }),
      ).not.toThrow()
    })
  })
})

describe('parseServerEnv', () => {
  const POOLER =
    'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'

  it('aceita a URL do pooler', () => {
    expect(parseServerEnv({ DATABASE_URL: POOLER })).toEqual({ DATABASE_URL: POOLER })
  })

  it('recusa sem a URL do banco, dizendo qual variável falta', () => {
    expect(() => parseServerEnv({})).toThrowError(/servidor[\s\S]*DATABASE_URL/)
  })

  it('recusa o banco local dentro da Vercel, dizendo de onde copiar', () => {
    vi.stubEnv('VERCEL', '1')

    expect(() =>
      parseServerEnv({
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54422/postgres',
      }),
    ).toThrowError(/Transaction pooler/)
  })
})
