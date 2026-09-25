'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { createCoverUploadUrl, updateEvent } from '@/actions/events'
import { actionError, type ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

/**
 * Capa do evento (doc 04): o navegador sobe o arquivo direto ao Storage, por
 * URL assinada, e só então a action grava o caminho, depois de conferir os
 * bytes. Sem capa enviada, vale a gerada a partir do título.
 */

const TIPOS = ['image/jpeg', 'image/png', 'image/webp'] as const
const LIMITE = 5 * 1024 * 1024

export function CapaDoEvento({
  id,
  src,
  temCapaEnviada,
  rascunho,
}: {
  id: string
  src: string
  temCapaEnviada: boolean
  rascunho: boolean
}) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)
  const idDoCampo = useId()

  async function enviar(arquivo: File) {
    if (!TIPOS.includes(arquivo.type as (typeof TIPOS)[number])) {
      setResultado(
        actionError('validation_error', 'A capa precisa ser JPEG, PNG ou WebP.'),
      )
      return
    }
    if (arquivo.size > LIMITE) {
      setResultado(actionError('validation_error', 'A capa pode ter até 5 MB.'))
      return
    }

    setEnviando(true)
    try {
      const url = await createCoverUploadUrl({
        eventId: id,
        contentType: arquivo.type as (typeof TIPOS)[number],
        size: arquivo.size,
      })
      if (!url.ok) return setResultado(url)

      const envio = await fetch(url.data.urlAssinada, {
        method: 'PUT',
        body: arquivo,
        headers: { 'content-type': arquivo.type },
      })
      if (!envio.ok) {
        return setResultado(
          actionError('validation_error', 'O envio da imagem falhou. Tente de novo.'),
        )
      }

      const gravado = await updateEvent({ id, coverPath: url.data.caminho })
      setResultado(gravado)
      if (gravado.ok) router.refresh()
    } finally {
      setEnviando(false)
    }
  }

  async function remover() {
    setEnviando(true)
    const resposta = await updateEvent({ id, coverPath: null })
    setResultado(resposta)
    setEnviando(false)
    if (resposta.ok) router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface relative aspect-video w-full max-w-md overflow-hidden rounded-md">
        {/* A capa gerada sai da rota pública, que responde 404 para rascunho:
            até o evento sair dele, o lugar da imagem explica em vez de quebrar. */}
        {!temCapaEnviada && rascunho ? (
          <p className="text-caption text-muted-foreground flex h-full items-center justify-center p-6 text-center">
            Sem capa enviada, o evento usa uma capa gerada a partir do título, que aparece
            quando ele sair do rascunho.
          </p>
        ) : (
          <Image
            alt={temCapaEnviada ? 'Capa enviada' : 'Capa gerada a partir do título'}
            className="object-cover"
            fill
            sizes="28rem"
            src={src}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {/* O campo nativo fica oculto porque o texto dele ("Choose File") é o do
            idioma do navegador; o rótulo faz as vezes de botão, em pt-BR. */}
        <input
          accept={TIPOS.join(',')}
          className="peer sr-only"
          disabled={enviando}
          id={idDoCampo}
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0]
            if (arquivo) void enviar(arquivo)
            evento.target.value = ''
          }}
          type="file"
        />
        <Label
          className="border-border hover:border-primary-muted peer-focus-visible:outline-primary w-fit cursor-pointer rounded-md border px-4 py-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
          htmlFor={idDoCampo}
        >
          {enviando
            ? 'Enviando...'
            : temCapaEnviada
              ? 'Trocar a capa'
              : 'Enviar uma capa'}
        </Label>
        <p className="text-caption text-muted-foreground">
          JPEG, PNG ou WebP, até 5 MB, na proporção 16:9 (como 1600 por 900). Sem texto
          sobre a imagem: o título já aparece ao lado.
        </p>
      </div>

      <ActionFeedback mensagemDeSucesso="Capa atualizada." resultado={resultado} />

      {temCapaEnviada ? (
        <Button
          className="w-fit"
          disabled={enviando}
          onClick={remover}
          type="button"
          variant="outline"
        >
          Voltar para a capa gerada
        </Button>
      ) : null}
    </div>
  )
}
