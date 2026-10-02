'use client'

import { useEffect } from 'react'

/**
 * Marca o documento quando o admin hidrata. O E2E espera por ela antes de
 * digitar: o que se digita antes da hidratação some nos campos controlados
 * do react-hook-form, e o WebKit, mais lento para hidratar, perdia o título
 * do evento (medido no M6, no spec do editor).
 */
export function MarcaDeHidratacao() {
  useEffect(() => {
    document.documentElement.dataset.hidratado = ''
  }, [])
  return null
}
