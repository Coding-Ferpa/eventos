import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseServerEnv, parseSiteEnv, parseSupabaseEnv, serverEnv } from './env'

afterEach(() => {
  vi.unstubAllEnvs()
})

const SITE_VALIDO = { NEXT_PUBLIC_SITE_URL: 'https://eventos.example.org' }

const SUPABASE_VALIDO = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'chave-anonima',
}

describe('parseSiteEnv', () => {
  it('aceita só a URL do site, sem exigir o Supabase que a Preview não tem', () => {
    // Regressão do M2: o layout raiz pedia a URL do site e levava junto a
    // exigência do Supabase, derrubando o build da Preview (doc 02).
    expect(parseSiteEnv(SITE_VALIDO)).toEqual(SITE_VALIDO)
  })

  it('recusa configuração faltando, dizendo qual variável e o que fazer', () => {
    expect(() => parseSiteEnv({})).toThrowError(/NEXT_PUBLIC_SITE_URL/)
    expect(() => parseSiteEnv({})).toThrowError(/\.env\.example/)
  })

  it('recusa valor que não é URL', () => {
    expect(() => parseSiteEnv({ NEXT_PUBLIC_SITE_URL: 'eventos.example.org' })).toThrow()
  })

  it('passa localhost fora da Vercel, que é onde ele faz sentido', () => {
    expect(() =>
      parseSiteEnv({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
    ).not.toThrow()
  })

  it('recusa o site local dentro da Vercel, explicando o que colar no lugar', () => {
    vi.stubEnv('VERCEL', '1')

    expect(() =>
      parseSiteEnv({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
    ).toThrowError(/não existe dentro da Vercel/)
  })
})

describe('parseSupabaseEnv', () => {
  it('aceita a configuração completa e devolve o valor tipado', () => {
    expect(parseSupabaseEnv(SUPABASE_VALIDO)).toEqual(SUPABASE_VALIDO)
  })

  it('recusa configuração faltando, dizendo qual variável', () => {
    expect(() => parseSupabaseEnv({})).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/)
    expect(() => parseSupabaseEnv({})).toThrowError(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('trata variável em branco como ausente, e não como valor vazio', () => {
    // `VARIAVEL=` em um arquivo .env significa "não informei". Sem isto, a
    // mensagem de erro falaria de formato em vez de falar de ausência.
    expect(() =>
      parseSupabaseEnv({ ...SUPABASE_VALIDO, NEXT_PUBLIC_SUPABASE_ANON_KEY: '   ' }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })

  it('passa o Supabase local fora da Vercel', () => {
    expect(() =>
      parseSupabaseEnv({
        ...SUPABASE_VALIDO,
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421',
      }),
    ).not.toThrow()
  })

  it('recusa o Supabase local dentro da Vercel, apontando o painel', () => {
    vi.stubEnv('VERCEL', '1')

    expect(() =>
      parseSupabaseEnv({
        ...SUPABASE_VALIDO,
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54421',
      }),
    ).toThrowError(/Project URL/)
  })

  it('não atrapalha a configuração pública de verdade na Vercel', () => {
    vi.stubEnv('VERCEL', '1')

    expect(() => parseSupabaseEnv(SUPABASE_VALIDO)).not.toThrow()
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
