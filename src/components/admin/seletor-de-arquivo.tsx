'use client'

import { useId } from 'react'

import { Label } from '@/components/ui/label'

/**
 * Botão de escolher arquivo em pt-BR. O campo nativo fica oculto porque o
 * texto dele ("Choose File") é o do idioma do navegador; o rótulo faz as vezes
 * de botão e herda o foco do teclado pelo `peer`.
 */
export function SeletorDeArquivo({
  accept,
  rotulo,
  desabilitado = false,
  aoEscolher,
}: {
  accept: string
  rotulo: string
  desabilitado?: boolean
  aoEscolher: (arquivo: File) => void
}) {
  const id = useId()
  return (
    <div className="flex">
      <input
        accept={accept}
        className="peer sr-only"
        disabled={desabilitado}
        id={id}
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0]
          evento.target.value = ''
          if (arquivo) aoEscolher(arquivo)
        }}
        type="file"
      />
      <Label
        className="border-border hover:border-primary-muted peer-focus-visible:outline-primary w-fit cursor-pointer rounded-md border px-4 py-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
        htmlFor={id}
      >
        {rotulo}
      </Label>
    </div>
  )
}
