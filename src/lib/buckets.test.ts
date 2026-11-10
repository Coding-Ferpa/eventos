import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { BUCKETS } from './buckets'

const raiz = process.cwd()
const ler = (arquivo: string) => readFileSync(path.join(raiz, arquivo), 'utf8')

describe('BUCKETS (ADR-0018)', () => {
  it('todo bucket do Eventos leva o prefixo, porque o projeto é dividido', () => {
    for (const nome of Object.values(BUCKETS)) expect(nome).toMatch(/^eventos-[a-z]+$/)
  })

  it('a migration cria exatamente estes buckets, e as policies citam só eles', () => {
    const migration = ler('supabase/migrations-eventos/0012_storage.sql')
    const criados = [...migration.matchAll(/^\s+\('([a-z-]+)', '\1',/gm)].map((m) => m[1])
    expect(criados.sort()).toEqual(Object.values(BUCKETS).sort())
    const citados = [
      ...migration.matchAll(/bucket_id = '([a-z-]+)'|bucket_id in \(([^)]+)\)/g),
    ].flatMap((m) =>
      m[1] ? [m[1]] : [...m[2]!.matchAll(/'([a-z-]+)'/g)].map((n) => n[1]!),
    )
    expect(citados.length).toBeGreaterThan(0)
    for (const nome of citados) expect(Object.values(BUCKETS)).toContain(nome)
  })

  it('o next.config libera a CDN da capa pelo mesmo nome', () => {
    expect(ler('next.config.ts')).toContain(
      `/storage/v1/object/public/${BUCKETS.capas}/**`,
    )
  })
})
