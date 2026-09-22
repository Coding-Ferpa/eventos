/**
 * Tema claro e escuro (doc 03): escuro é o padrão, a escolha fica em cookie e
 * o `prefers-color-scheme` vale enquanto ninguém escolheu.
 *
 * A leitura acontece em um script inline que roda antes da primeira pintura, e
 * não no servidor: ler cookie no layout tornaria toda página dinâmica e
 * derrubaria o ISR que o doc 09 exige da área pública. O cookie continua sendo
 * a persistência, e quem aplica é o script, sem flash.
 */

export const COOKIE_TEMA = 'cf-tema'
export const TEMAS = ['dark', 'light'] as const

export type Tema = (typeof TEMAS)[number]

export function isTema(value: unknown): value is Tema {
  return value === 'dark' || value === 'light'
}

/** Um ano: a escolha de tema não precisa ser refeita a cada visita. */
export const MAX_AGE_DO_COOKIE = 60 * 60 * 24 * 365

/**
 * Script aplicado antes da pintura. Mantido pequeno e sem dependência de
 * propósito: ele bloqueia a renderização por alguns milissegundos.
 */
export const SCRIPT_DE_TEMA = `
(function () {
  try {
    var escolha = document.cookie.match(/(?:^|; )${COOKIE_TEMA}=(dark|light)/)
    var tema = escolha
      ? escolha[1]
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    document.documentElement.setAttribute('data-theme', tema)
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark')
  }
})()
`.trim()
