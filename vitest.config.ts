import path from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Cobertura é exigida onde mora a lógica (doc 11); UI e rotas são
      // cobertas por E2E.
      include: ['src/features/**', 'src/lib/**'],
      // Encanamento de sessão: fábricas em volta de `@supabase/ssr` e
      // `next/headers`, sem decisão própria. Testá-las seria testar o mock; quem
      // cobre esse caminho é o E2E de autorização (E05 do doc 11). Mesma
      // decisão do CF Jobs.
      exclude: ['src/lib/supabase/**', 'src/lib/auth.ts'],
      thresholds: {
        // Os limites de `src/features/certificate` e de `src/features/import`
        // (90 de linhas, 85 de ramos) entram junto com os módulos, no M5 e no
        // M7: glob sem arquivo não mede nada e só daria falsa segurança.
        'src/lib/**': { lines: 80, branches: 75 },
      },
    },
  },
})
