'use client'

import { useState } from 'react'

import { formatCode } from '@/features/certificate/code'

/** "Copiar código" (doc 03, 6c): quem precisa colar o código num formulário. */
export function CopiarCodigo({ code }: { code: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="text-primary min-h-11 text-sm underline-offset-4 hover:underline"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(formatCode(code))
            .then(() => setCopiado(true))
            .catch(() => setCopiado(false))
        }}
        type="button"
      >
        Copiar código
      </button>
      <span aria-live="polite" className="text-caption text-muted-foreground">
        {copiado ? 'Copiado.' : ''}
      </span>
    </span>
  )
}
