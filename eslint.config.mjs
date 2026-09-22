import js from '@eslint/js'
import nextPlugin from '@next/eslint-plugin-next'
import prettierConfig from 'eslint-config-prettier'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'coverage/**',
      'node_modules/**',
      'out/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  // O `z` do projeto vem com o locale pt-BR aplicado; importar `zod` direto
  // devolve uma instância sem ele, e as mensagens de validação voltam a sair
  // em inglês sem ninguém perceber (ADR-0016 do CF Jobs, herdado).
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['src/lib/zod.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message:
                "Importe `z` de '@/lib/zod': é a instância com o locale pt-BR (ADR-0016).",
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // `any` desliga a checagem de tipos: só passa com justificativa explícita.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  // Dois objetos, e não um só com os dois espalhados: `jsx-runtime` também tem
  // a chave `rules`, e espalhar os dois no mesmo objeto faz a segunda
  // sobrescrever a primeira, desligando em silêncio todas as regras
  // recomendadas do plugin react (`jsx-key` inclusive).
  {
    files: ['**/*.{jsx,tsx}'],
    ...react.configs.flat.recommended,
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    ...react.configs.flat['jsx-runtime'],
  },
  {
    files: ['**/*.{jsx,tsx}'],
    rules: {
      // A regra quer `noreferrer` junto do alvo em nova aba, por causa de
      // navegador antigo sem `noopener`. O doc 03 especifica só `noopener` nos
      // links da comunidade de propósito: `noreferrer` também apaga o Referer,
      // e é por ele que o site da comunidade enxerga o tráfego que sai daqui.
      'react/jsx-no-target-blank': ['error', { allowReferrer: true }],
    },
  },
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      ...reactHooks.configs.flat.recommended.rules,
    },
  },

  // Fronteira entre camadas (doc 02). As demais chegam junto com o que elas
  // protegem: `features/**` sem `next/*` no M5 e no M7, e o confinamento de
  // `public-lookup.ts` no M8 (doc 08).
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      // A regra é sobre acesso ao banco, não sobre tipos: tipar props com o
      // retorno de uma query é o fluxo desejado, e `import type` some no build.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/db', '@/db/*', '**/db/queries', '**/db/schema'],
              allowTypeImports: true,
              message:
                'Componentes não acessam o banco: recebem dados por props de Server Components (doc 02).',
            },
          ],
        },
      ],
    },
  },

  // Testes e scripts rodam fora do app.
  {
    files: ['**/*.test.{ts,tsx}', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },

  prettierConfig,
)
