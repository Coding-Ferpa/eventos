/**
 * Garante que `.env.example` documenta exatamente as variáveis do schema Zod
 * (doc 01). Roda no CI: variável nova sem documentação quebra o build, e
 * variável documentada que ninguém lê também.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { serverEnvSchema, siteEnvSchema, supabaseEnvSchema } from '../src/lib/env'

const EXAMPLE_PATH = resolve(process.cwd(), '.env.example')

function keysFromExample(contents: string): string[] {
  return contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split('=')[0]?.trim() ?? '')
    .filter((key) => key.length > 0)
}

function main(): void {
  const schemaKeys = [
    ...Object.keys(siteEnvSchema.shape),
    ...Object.keys(supabaseEnvSchema.shape),
    ...Object.keys(serverEnvSchema.shape),
  ].sort()

  const exampleKeys = keysFromExample(readFileSync(EXAMPLE_PATH, 'utf8'))
  const duplicated = exampleKeys.filter(
    (key, index) => exampleKeys.indexOf(key) !== index,
  )
  const missing = schemaKeys.filter((key) => !exampleKeys.includes(key))
  const extra = exampleKeys.filter((key) => !schemaKeys.includes(key))

  const problems: string[] = []
  if (missing.length > 0) {
    problems.push(`Faltam em .env.example: ${missing.join(', ')}`)
  }
  if (extra.length > 0) {
    problems.push(`Sobram em .env.example (fora do schema): ${extra.join(', ')}`)
  }
  if (duplicated.length > 0) {
    problems.push(`Duplicadas em .env.example: ${[...new Set(duplicated)].join(', ')}`)
  }

  if (problems.length > 0) {
    console.error('✖ .env.example está fora de sincronia com src/lib/env.ts\n')
    for (const problem of problems) console.error(`  ${problem}`)
    console.error('\nAtualize .env.example ou o schema e rode novamente.')
    process.exit(1)
  }

  console.log(`✔ .env.example em sincronia (${schemaKeys.length} variáveis).`)
}

main()
