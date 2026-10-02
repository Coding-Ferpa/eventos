'use client'

import { CircleCheck, Download } from 'lucide-react'
import { useState } from 'react'

/**
 * O CTA "Baixar PDF" (doc 03, 6c). Um `<a href>` comum, sem `download` e sem
 * blob: o `Content-Disposition` baixa no sucesso, e a falha de geração volta a
 * esta tela com o alerta. Blob falha nos navegadores embutidos do WhatsApp e
 * do Instagram, por onde o aluno chega. O toque não é interceptado: o painel
 * só confirma que algo foi pedido.
 */
export function BaixarPdf({ code, destaque }: { code: string; destaque: boolean }) {
  const [iniciado, setIniciado] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          destaque
            ? 'bg-background/90 sticky bottom-0 -mx-5 px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:p-0'
            : ''
        }
      >
        <a
          className={[
            'bg-primary-solid text-primary-foreground inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full px-6 font-semibold sm:w-fit',
            destaque ? 'shadow-glow' : '',
          ].join(' ')}
          href={`/api/certificados/${code}/pdf`}
          onClick={() => setIniciado(true)}
        >
          <Download aria-hidden="true" className="size-4" />
          Baixar PDF
        </a>
      </div>
      {iniciado ? (
        <p
          className="border-success shadow-glow flex items-start gap-2 rounded-md border px-4 py-3"
          role="status"
        >
          <CircleCheck
            aria-hidden="true"
            className="text-success mt-0.5 size-5 shrink-0"
          />
          Download iniciado. Se nada aconteceu, toque em Baixar PDF de novo.
        </p>
      ) : null}
    </div>
  )
}
