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
  const SERVIDOR_VALIDO = {
    DATABASE_URL:
      'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
    DEVICE_COOKIE_SECRET: 'Zm9ybWF0by1kZS1vcGVuc3NsLXJhbmQtYmFzZTY0LTMy',
    IP_HASH_SECRET: 'b3V0cm8tc2VncmVkby1nZXJhZG8tcGVsby1vcGVuc3Ns',
    SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico',
    CPF_PEPPER: 'cGVwcGVyLWRvLWNwZi1nZXJhZG8tcGVsby1vcGVuc3Ns',
  }

  it('aceita o pooler e os segredos, sem exigir o GitHub', () => {
    expect(parseServerEnv(SERVIDOR_VALIDO)).toEqual(SERVIDOR_VALIDO)
  })

  it('aceita as credenciais do GitHub quando existem', () => {
    const env = parseServerEnv({
      ...SERVIDOR_VALIDO,
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
        ...SERVIDOR_VALIDO,
        DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54422/postgres',
      }),
    ).toThrowError(/Transaction pooler/)
  })

  it('recusa segredo curto demais para um HMAC', () => {
    expect(() =>
      parseServerEnv({ ...SERVIDOR_VALIDO, DEVICE_COOKIE_SECRET: 'curto' }),
    ).toThrowError(/DEVICE_COOKIE_SECRET/)
  })

  describe('valor de desenvolvimento do .env.example', () => {
    const DE_DESENVOLVIMENTO = {
      ...SERVIDOR_VALIDO,
      IP_HASH_SECRET: 'desenvolvimento-local-hash-diario-de-ip-e-dispositivo',
    }

    it('passa fora da Vercel, que é para isso que ele existe', () => {
      expect(() => parseServerEnv(DE_DESENVOLVIMENTO)).not.toThrow()
    })

    it('é recusado dentro da Vercel: ele é público, está no repositório', () => {
      vi.stubEnv('VERCEL', '1')

      expect(() => parseServerEnv(DE_DESENVOLVIMENTO)).toThrowError(
        /IP_HASH_SECRET[\s\S]*openssl rand -base64 32/,
      )
    })

    it('vale para o pepper do CPF, o segredo que nunca pode ser trocado', () => {
      vi.stubEnv('VERCEL', '1')

      expect(() =>
        parseServerEnv({
          ...SERVIDOR_VALIDO,
          CPF_PEPPER: 'desenvolvimento-local-pepper-do-cpf-cf-eventos-nao-usar',
        }),
      ).toThrowError(/CPF_PEPPER[\s\S]*openssl rand -base64 32/)
    })
  })

  it('recusa sem o pepper do CPF, dizendo qual variável falta', () => {
    const { CPF_PEPPER: _, ...semPepper } = SERVIDOR_VALIDO
    expect(() => parseServerEnv(semPepper)).toThrowError(/CPF_PEPPER/)
  })
})

describe('serverEnv', () => {
  it('recusa ser lido no navegador, onde viraria vazamento de segredo', () => {
    // Este arquivo roda em jsdom, que tem `window`: é o navegador.
    expect(() => serverEnv()).toThrowError(/só pode ser lido no servidor/)
  })
})
