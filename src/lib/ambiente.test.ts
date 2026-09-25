// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { semBanco } from './ambiente'

afterEach(() => {
  vi.unstubAllEnvs()
})

const POOLER =
  'postgresql://postgres.abc:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'

describe('semBanco (ADR-0014)', () => {
  it('é o modo da Preview: sem banco e fora da produção', () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('VERCEL_ENV', 'preview')

    expect(semBanco()).toBe(true)
  })

  it('é o modo do build do CI, que nem roda na Vercel', () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('VERCEL_ENV', '')

    expect(semBanco()).toBe(true)
  })

  it('nunca vale em produção: lá, faltar o banco é erro, e não site vazio', () => {
    vi.stubEnv('DATABASE_URL', '')
    vi.stubEnv('VERCEL_ENV', 'production')

    expect(semBanco()).toBe(false)
  })

  it('com banco configurado, usa o banco em qualquer ambiente', () => {
    vi.stubEnv('DATABASE_URL', POOLER)

    for (const ambiente of ['', 'preview', 'production']) {
      vi.stubEnv('VERCEL_ENV', ambiente)
      expect(semBanco()).toBe(false)
    }
  })

  it('trata variável em branco como ausente, como o contrato de env', () => {
    vi.stubEnv('DATABASE_URL', '   ')
    vi.stubEnv('VERCEL_ENV', 'preview')

    expect(semBanco()).toBe(true)
  })
})
