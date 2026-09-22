'use client'

import { useSyncExternalStore } from 'react'

import { COOKIE_TEMA, isTema, MAX_AGE_DO_COOKIE, type Tema } from '@/lib/theme'

/**
 * O tema mora no DOM (atributo `data-theme`), colocado lá pelo script inline
 * antes da primeira pintura. O componente lê essa fonte externa em vez de
 * manter cópia em estado: assim não existe divergência de hidratação nem
 * segundo lugar onde a verdade possa ficar desatualizada.
 */
function assinar(aoMudar: () => void) {
  const observador = new MutationObserver(aoMudar)
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => observador.disconnect()
}

function lerDoDom(): Tema {
  const atributo = document.documentElement.getAttribute('data-theme')
  return isTema(atributo) ? atributo : 'dark'
}

export function ThemeToggle() {
  // No servidor não há como saber a escolha; assumimos o padrão do doc 03.
  const tema = useSyncExternalStore(assinar, lerDoDom, () => 'dark' as Tema)

  function alternar() {
    const proximo: Tema = tema === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', proximo)
    document.cookie = `${COOKIE_TEMA}=${proximo}; path=/; max-age=${MAX_AGE_DO_COOKIE}; samesite=lax`
  }

  const rotulo = tema === 'light' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro'

  return (
    <button
      aria-label={rotulo}
      className="border-border hover:border-primary-muted text-caption inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 py-1.5 transition duration-150"
      onClick={alternar}
      title={rotulo}
      type="button"
    >
      {/* O glifo mostra o destino, não o estado atual. */}
      <span aria-hidden="true">{tema === 'light' ? '☾' : '☀'}</span>
    </button>
  )
}
