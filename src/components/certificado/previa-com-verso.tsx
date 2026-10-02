'use client'

import { Check } from 'lucide-react'
import { useState } from 'react'

/**
 * A prévia do certificado, desenhada no servidor (doc 03, 6c). Com verso, o
 * seletor "Frente / Verso" troca qual SVG aparece; os dois já vieram prontos.
 */
export function PreviaComVerso({ paginas }: { paginas: string[] }) {
  const [atual, setAtual] = useState(0)
  return (
    <div className="flex flex-col gap-2">
      {paginas.length > 1 ? (
        <div aria-label="Página da prévia" className="flex gap-2" role="group">
          {['Frente', 'Verso'].map((rotulo, i) => (
            <button
              aria-pressed={atual === i}
              // Estado nunca só por cor (doc 03, seção 8): o marcado ganha o
              // ícone e o peso.
              className={[
                'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm',
                atual === i
                  ? 'border-primary text-foreground font-semibold'
                  : 'border-border text-muted-foreground',
              ].join(' ')}
              key={rotulo}
              onClick={() => setAtual(i)}
              type="button"
            >
              {atual === i ? (
                <Check aria-hidden="true" className="text-primary size-4" />
              ) : null}
              {rotulo}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className="border-border bg-surface overflow-hidden rounded-md border"
        // O SVG sai do nosso desenhista: texto em contornos de glifo e
        // atributos escapados.
        dangerouslySetInnerHTML={{ __html: paginas[atual] ?? '' }}
      />
    </div>
  )
}
