'use client'

import { useEffect } from 'react'

/**
 * Avisa que a página do evento foi aberta (doc 10), para medir o tempo entre a
 * visita e o download sem seguir ninguém. O servidor identifica o dispositivo
 * pelo cookie que o proxy emitiu, então o corpo vai vazio.
 *
 * `sendBeacon` não segura a navegação, e a falha é silenciosa: métrica nunca
 * pode atrapalhar quem só quer o certificado.
 */
export function VisitBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    const destino = `/api/eventos/${encodeURIComponent(slug)}/visita`

    try {
      const enviado = navigator.sendBeacon?.(destino)
      if (!enviado) {
        void fetch(destino, { method: 'POST', keepalive: true }).catch(() => {})
      }
    } catch {
      // Sem beacon, sem métrica. A página segue igual.
    }
  }, [slug])

  return null
}
