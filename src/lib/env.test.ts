import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseClientEnv, parseServerEnv, serverEnv } from './env'

afterEach(() => {
  vi.unstubAllEnvs()
})

const CLIENTE_VALIDO = {
  NEXT_PUBLIC_SITE_URL: 'https://eventos.example.org',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chave-anonima',
}

describe('parseClientEnv', () => {
  it('aceita a configuração completa e devolve o valor tipado', () => {
    expect(parseClientEnv(CLIENTE_VALIDO)).toEqual(CLIENTE_VALIDO)
  })

  it('recusa configuração faltando, dizendo qual variável e o que fazer', () => {
    expect(() => parseClientEnv({})).toThrowError(/NEXT_PUBLIC_SITE_URL/)
    expect(() => parseClientEnv({})).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(() => parseClientEnv({})).toThrowError(/\.env\.example/)
  })

  it('recusa valor que não é URL', () => {
    expect(() =>
      parseClientEnv({ ...CLIENTE_VALIDO, NEXT_PUBLIC_SITE_URL: 'eventos.example.org' }),
    ).toThrow()
  })

  it('trata variável em branco como ausente, e não como valor vazio', () => {
    // `VARIAVEL=` em um arquivo .env significa "não informei". Sem isto, a
    // mensagem de erro falaria de formato em vez de falar de ausência.
    expect(() =>
      parseClientEnv({ ...CLIENTE_VALIDO, NEXT_PUBLIC_SUPABASE_ANON_KEY: '   ' }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  describe('endereço local na Vercel', () => {
    const LOCAL = {
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chave-local',
    }

    it('passa fora da Vercel, que é onde localhost faz sentido', () => {
      expect(() => parseClientEnv(LOCAL)).not.toThrow()
    })

    it('recusa o site local dentro da Vercel, explicando o que colar no lugar', () => {
      vi.stubEnv('VERCEL', '1')

      expect(() =>
        parseClientEnv({
          ...CLIENTE_VALIDO,
          NEXT_PUBLIC_SITE_URL: LOCAL.NEXT_PUBLIC_SITE_URL,
        }),
      ).toThrowError(/não existe dentro da Vercel/)
    })

    it('recusa o Supabase local dentro da Vercel, apontando o painel', () => {
      vi.stubEnv('VERCEL', '1')

      expect(() =>
        parseClientEnv({
          ...CLIENTE_VALIDO,
          NEXT_PUBLIC_SUPABASE_URL: LOCAL.NEXT_PUBLIC_SUPABASE_URL,
        }),
      ).toThrowError(/Project URL/)
    })

    it('não atrapalha a configuração pública de verdade na Vercel', () => {
      vi.stubEnv('VERCEL', '1')

      expect(() => parseClientEnv(CLIENTE_VALIDO)).not.toThrow()
    })
  })
})

describe('parseServerEnv', () => {
  const POOLER =
    'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'

  it('aceita a URL do pooler, sem exigir o GitHub', () => {
    expect(parseServerEnv({ DATABASE_URL: POOLER })).toEqual({ DATABASE_URL: POOLER })
  })

  it('aceita as credenciais do GitHub quando existem', () => {
    const env = parseServerEnv({
      DATABASE_URL: POOLER,
      SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: 'id',
      SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: 'segredo',
    })

    expect(env.SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID).toBe('id')
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

describe('serverEnv', () => {
  it('recusa ser lido no navegador, onde viraria vazamento de segredo', () => {
    // Este arquivo roda em jsdom, que tem `window`: é o navegador.
    expect(() => serverEnv()).toThrowError(/só pode ser lido no servidor/)
  })
})
