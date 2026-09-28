'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createFontUploadUrl, uploadCustomFont } from '@/actions/fonts'
import { actionError, type ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { SeletorDeArquivo } from '@/components/admin/seletor-de-arquivo'

/**
 * Fontes enviadas pelo admin (doc 05): TTF ou OTF estático, até 2 MB, um
 * arquivo por peso. O servidor confere formato, cobertura do português e a
 * ida e volta do subset; família e peso saem do próprio arquivo.
 */

const LIMITE = 2 * 1024 * 1024

export type FonteNaLista = { id: string; family: string; weight: number }

export function FontesEnviadas({ fontes }: { fontes: FonteNaLista[] }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)
  const [mensagem, setMensagem] = useState<string>('Fonte conferida e disponível.')

  async function enviar(arquivo: File) {
    const extensao = arquivo.name.split('.').pop()?.toLowerCase()
    if (extensao !== 'ttf' && extensao !== 'otf') {
      return setResultado(actionError('validation_error', 'Envie a fonte em TTF ou OTF.'))
    }
    if (arquivo.size > LIMITE) {
      return setResultado(actionError('validation_error', 'A fonte pode ter até 2 MB.'))
    }

    setEnviando(true)
    try {
      const url = await createFontUploadUrl({ extension: extensao, size: arquivo.size })
      if (!url.ok) return setResultado(url)
      const envio = await fetch(url.data.urlAssinada, {
        method: 'PUT',
        body: arquivo,
        headers: { 'content-type': 'application/octet-stream' },
      })
      if (!envio.ok) {
        return setResultado(
          actionError('validation_error', 'O envio da fonte falhou. Tente de novo.'),
        )
      }
      const gravada = await uploadCustomFont({ storagePath: url.data.caminho })
      if (gravada.ok) {
        setMensagem(
          gravada.data.repetida
            ? 'Essa fonte já tinha sido enviada: ela continua disponível.'
            : gravada.data.subsetOk
              ? 'Fonte conferida e disponível.'
              : 'Fonte disponível. Ela falhou no teste de subset e vai inteira em cada PDF, que fica uns 80 KB maior.',
        )
        router.refresh()
      }
      setResultado(gravada)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {fontes.length > 0 ? (
        <ul className="text-caption flex flex-wrap gap-2">
          {fontes.map((fonte) => (
            <li className="border-border rounded-md border px-2 py-1" key={fonte.id}>
              {fonte.family} {fonte.weight}
            </li>
          ))}
        </ul>
      ) : null}
      <SeletorDeArquivo
        accept=".ttf,.otf"
        aoEscolher={(arquivo) => void enviar(arquivo)}
        desabilitado={enviando}
        rotulo={enviando ? 'Conferindo a fonte...' : 'Enviar uma fonte'}
      />
      <p className="text-caption text-muted-foreground">
        TTF ou OTF estático, até 2 MB, um arquivo por peso. Fonte variável não é aceita.
      </p>
      <ActionFeedback mensagemDeSucesso={mensagem} resultado={resultado} />
    </div>
  )
}
