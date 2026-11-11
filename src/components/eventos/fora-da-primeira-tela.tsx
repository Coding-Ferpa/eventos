'use client'

import { useSyncExternalStore, type ReactNode } from 'react'

/** O `sm` do Tailwind: daqui para cima o catálogo tem duas colunas ou mais. */
const DUAS_COLUNAS = '(min-width: 640px)'

function podeMontar(): boolean {
  return window.matchMedia(DUAS_COLUNAS).matches || document.readyState === 'complete'
}

function assinar(avisar: () => void): () => void {
  const consulta = window.matchMedia(DUAS_COLUNAS)
  window.addEventListener('load', avisar)
  consulta.addEventListener('change', avisar)
  return () => {
    window.removeEventListener('load', avisar)
    consulta.removeEventListener('change', avisar)
  }
}

/**
 * Capa de card que, no celular, fica fora da primeira tela (ADR-0015). Com uma
 * coluna, só o primeiro card aparece de cara, e a capa dele é o LCP: as outras
 * esperam o `load` da página para não dividir a banda com ela. O `lazy` não
 * bastava, porque o Chrome antecipa imagens a até 1.250 px da tela. Medido no
 * Lighthouse mobile: a `/` caiu de 2,51 para 2,33 s.
 *
 * Com duas colunas ou mais, a capa está na primeira linha e monta já na
 * hidratação. No servidor nada é montado: sem JavaScript, o card fica com o
 * fundo da capa, sem imagem, e a capa é decorativa (`alt` vazio).
 */
export function ForaDaPrimeiraTela({ children }: { children: ReactNode }) {
  const montar = useSyncExternalStore(assinar, podeMontar, () => false)
  return montar ? children : null
}
