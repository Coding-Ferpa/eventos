'use client'

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
              className={[
                'min-h-11 rounded-full border px-4 text-sm',
                atual === i
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground',
              ].join(' ')}
              key={rotulo}
              onClick={() => setAtual(i)}
              type="button"
            >
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
