// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `serverEnv()` guarda o resultado no módulo, então cada caso importa uma
 * cópia nova depois de ajustar o ambiente. Roda em Node, sem `window`, que é
 * onde a leitura de segredo é permitida.
 */

const POOLER =
  'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'

async function envNovo() {
  vi.resetModules()
  return import('./env')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('serverEnv no servidor', () => {
  it('lê e valida as variáveis de servidor', async () => {
    vi.stubEnv('DATABASE_URL', POOLER)
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
    vi.stubEnv('DATABASE_URL', POOLER)
    vi.stubEnv('SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID', '')
    const { isGithubOAuthEnabled } = await envNovo()

    expect(isGithubOAuthEnabled()).toBe(false)
  })

  it('liga quando o id do OAuth App existe', async () => {
    vi.stubEnv('DATABASE_URL', POOLER)
    vi.stubEnv('SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID', 'id-do-app')
    const { isGithubOAuthEnabled } = await envNovo()

    expect(isGithubOAuthEnabled()).toBe(true)
  })
})
