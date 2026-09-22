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
      thresholds: {
        // Os limites de `src/features/certificate` e de `src/features/import`
        // (90 de linhas, 85 de ramos) entram junto com os módulos, no M5 e no
        // M7: glob sem arquivo não mede nada e só daria falsa segurança.
        'src/lib/**': { lines: 80, branches: 75 },
      },
    },
  },
})
