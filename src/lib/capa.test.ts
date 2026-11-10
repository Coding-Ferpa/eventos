// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
})

// `supabaseEnv()` guarda o resultado no módulo: cada caso importa uma cópia
// nova depois de ajustar o ambiente.
async function capaNova() {
  vi.resetModules()
  return import('./capa')
}

describe('srcDaCapa', () => {
  it('sem capa enviada, aponta para a capa gerada do evento', async () => {
    // Sem Supabase configurado, de propósito: a capa gerada não precisa dele,
    // e é ela que a Preview sem banco mostra.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    const { srcDaCapa } = await capaNova()

    expect(srcDaCapa({ slug: 'ferpa-tech-day-2026', coverPath: null })).toBe(
      '/eventos/ferpa-tech-day-2026/capa',
    )
  })

  it('com capa enviada, usa a URL pública do bucket covers', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co/')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'chave-anonima')
    const { srcDaCapa } = await capaNova()

    expect(srcDaCapa({ slug: 'x', coverPath: 'e001/capa.webp' })).toBe(
      'https://abc.supabase.co/storage/v1/object/public/eventos-covers/e001/capa.webp',
    )
  })
})
