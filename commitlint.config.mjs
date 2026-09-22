/**
 * Conventional Commits (doc 12). Validado no CI, e não em hook local pesado,
 * para não bloquear contribuidor iniciante por tooling.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf', 'ci', 'revert'],
    ],
    // Assuntos em pt-BR frequentemente começam com maiúscula em siglas (API, RLS, CPF).
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
}
