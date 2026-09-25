import path from 'node:path'

import { defineConfig } from 'vitest/config'

/**
 * Suíte de integração (doc 12): roda contra o Supabase local, com as
 * migrations e os seeds aplicados. Fica separada da unitária de propósito:
 * quem contribui com UI não deveria precisar de Docker para rodar `pnpm test`.
 * Herdada do CF Jobs.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Os módulos de servidor importam `server-only`, que estoura fora de um
      // Server Component. O próprio pacote traz o módulo vazio que o React usa
      // sob a condição `react-server`; apontar para ele aqui evita ligar essa
      // condição no projeto todo, o que traria a build de servidor do React e
      // quebraria os imports de `next/navigation`.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    // Um banco só, compartilhado: arquivos em paralelo disputariam as mesmas
    // linhas.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
