// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `serverEnv()` guarda o resultado no módulo, então cada caso importa uma
 * cópia nova depois de ajustar o ambiente. Roda em Node, sem `window`, que é
 * onde a leitura de segredo é permitida.
 */

const POOLER =
  'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'

/** Ambiente de servidor completo e válido, como o de produção. */
function stubServidorValido() {
  vi.stubEnv('DATABASE_URL', POOLER)
  vi.stubEnv('DEVICE_COOKIE_SECRET', 'Zm9ybWF0by1kZS1vcGVuc3NsLXJhbmQtYmFzZTY0LTMy')
  vi.stubEnv('IP_HASH_SECRET', 'b3V0cm8tc2VncmVkby1nZXJhZG8tcGVsby1vcGVuc3Ns')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'chave-de-servico')
  vi.stubEnv('CPF_PEPPER', 'cGVwcGVyLWRvLWNwZi1nZXJhZG8tcGVsby1vcGVuc3Ns')
  vi.stubEnv('RETRIEVAL_COOKIE_KEY', 'aizH4cjxZz4Jl2jNHcqWKcMUjTEKJDEnQZ6Nd5q4VNY=')
}

async function envNovo() {
  vi.resetModules()
  return import('./env')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('serverEnv no servidor', () => {
  it('lê e valida as variáveis de servidor', async () => {
    stubServidorValido()
    const { serverEnv } = await envNovo()

    expect(serverEnv().DATABASE_URL).toBe(POOLER)
  })

  it('para com mensagem clara quando falta o banco', async () => {
    vi.stubEnv('DATABASE_URL', '')
    const { serverEnv } = await envNovo()

    expect(() => serverEnv()).toThrowError(/DATABASE_URL/)
  })
})

describe('isGithubOAuthEnabled', () => {
  it('fica desligado sem as credenciais do OAuth App', async () => {
    stubServidorValido()
    vi.stubEnv('SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID', '')
    const { isGithubOAuthEnabled } = await envNovo()

    expect(isGithubOAuthEnabled()).toBe(false)
  })

  it('liga quando o id do OAuth App existe', async () => {
    stubServidorValido()
    vi.stubEnv('SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID', 'id-do-app')
    const { isGithubOAuthEnabled } = await envNovo()

    expect(isGithubOAuthEnabled()).toBe(true)
  })
})

describe('Preview sem banco (doc 02)', () => {
  it('a URL do site é lida sem o Supabase e sem o banco', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://preview.example.org')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.stubEnv('DATABASE_URL', '')
    const { siteEnv, supabaseEnv } = await envNovo()

    expect(siteEnv().NEXT_PUBLIC_SITE_URL).toBe('https://preview.example.org')
    // Quem precisa do Supabase continua recusando a ausência dele.
    expect(() => supabaseEnv()).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('o Supabase é lido quando está configurado', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'chave-anonima')
    const { supabaseEnv } = await envNovo()

    expect(supabaseEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co')
  })
})
