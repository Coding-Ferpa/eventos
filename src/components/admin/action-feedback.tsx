'use client'

import { CircleAlert, CircleCheck } from 'lucide-react'

import type { ActionResult } from '@/actions/result'

/**
 * Retorno de action em texto, com `role` de status ou alerta para leitor de
 * tela anunciar. Inline em vez de toast: uma mensagem que some sozinha é
 * péssima para erro de formulário, que é justamente onde ela mais aparece.
 */
export function ActionFeedback({
  resultado,
  mensagemDeSucesso,
}: {
  resultado: ActionResult<unknown> | null
  mensagemDeSucesso?: string
}) {
  if (!resultado) return null

  if (resultado.ok) {
    if (!mensagemDeSucesso) return null

    return (
      <p className="text-success text-caption flex items-center gap-2" role="status">
        <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
        {mensagemDeSucesso}
      </p>
    )
  }

  return (
    <p
      className="text-destructive border-destructive text-caption flex items-start gap-2 rounded-md border px-3 py-2"
      role="alert"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {resultado.error.message}
    </p>
  )
}
