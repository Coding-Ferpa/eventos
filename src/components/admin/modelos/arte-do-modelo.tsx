'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { actionError, actionOk, type ActionResult } from '@/actions/result'
import { attachArt, createArtUploadUrls } from '@/actions/template-art'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { SeletorDeArquivo } from '@/components/admin/seletor-de-arquivo'

/**
 * A arte do modelo (doc 05): PDF de uma ou duas páginas, ou uma imagem PNG ou
 * JPG. O navegador rasteriza o fundo da prévia e sobe tudo direto ao Storage;
 * o servidor gera o base.pdf canônico e confere cada regra de novo.
 */

const TIPOS = ['application/pdf', 'image/png', 'image/jpeg'] as const
type Tipo = (typeof TIPOS)[number]
const LIMITE = 10 * 1024 * 1024

type Pagina = { width_pt: number; height_pt: number }

export function ArteDoModelo({
  templateId,
  paginas,
}: {
  templateId: string
  paginas: Pagina[]
}) {
  const router = useRouter()
  const [etapa, setEtapa] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])

  async function put(url: string, corpo: Blob, tipo: string) {
    const resposta = await fetch(url, {
      method: 'PUT',
      body: corpo,
      headers: { 'content-type': tipo },
    })
    if (!resposta.ok) throw new Error('envio')
  }

  async function enviar(arquivo: File) {
    setAvisos([])
    if (!TIPOS.includes(arquivo.type as Tipo)) {
      return setResultado(
        actionError('art_unsupported_type', 'Envie a arte em PDF, PNG ou JPG.'),
      )
    }
    if (arquivo.size > LIMITE) {
      return setResultado(actionError('validation_error', 'A arte pode ter até 10 MB.'))
    }

    try {
      setEtapa('Preparando a prévia da arte…')
      // Só nesta tela: o pdf.js não entra no pacote de nenhuma outra.
      const { rasterizarArte, ErroDeArte } = await import('./rasterizar')
      let previas: Blob[]
      try {
        previas = await rasterizarArte(arquivo)
      } catch (erro) {
        if (erro instanceof ErroDeArte)
          return setResultado(actionError('validation_error', erro.message))
        throw erro
      }

      setEtapa('Enviando a arte…')
      const urls = await createArtUploadUrls({
        templateId,
        art: { contentType: arquivo.type as Tipo, size: arquivo.size },
        previews: previas.length,
      })
      if (!urls.ok) return setResultado(urls)
      await put(urls.data.arte.urlAssinada, arquivo, arquivo.type)
      await Promise.all(
        urls.data.previas.map((previa, i) =>
          put(previa.urlAssinada, previas[i]!, 'image/webp'),
        ),
      )

      setEtapa('Conferindo a arte…')
      const anexada = await attachArt({
        templateId,
        artPath: urls.data.arte.caminho,
        previewPaths: urls.data.previas.map((previa) => previa.caminho),
      })
      if (!anexada.ok) return setResultado(anexada)
      setAvisos(anexada.data.warnings.map((aviso) => aviso.detail))
      setResultado(actionOk())
      router.refresh()
    } catch {
      setResultado(
        actionError('validation_error', 'O envio da arte falhou. Tente de novo.'),
      )
    } finally {
      setEtapa(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {paginas.length > 0 ? (
        <p className="text-caption text-muted-foreground">
          {paginas.length === 1 ? 'Uma página' : 'Frente e verso'}:{' '}
          {paginas
            .map(
              (pagina) =>
                `${pagina.width_pt.toFixed(2).replace('.', ',')} × ${pagina.height_pt.toFixed(2).replace('.', ',')} pt`,
            )
            .join(' e ')}
          . Trocar por outra arte da mesma proporção não move nenhum campo.
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">
          PDF (recomendado) de uma página, ou de duas com o verso; ou PNG ou JPG com pelo
          menos 2.000 px no lado maior.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SeletorDeArquivo
          accept={TIPOS.join(',')}
          aoEscolher={(arquivo) => void enviar(arquivo)}
          desabilitado={etapa !== null}
          rotulo={paginas.length > 0 ? 'Trocar a arte' : 'Enviar a arte'}
        />
        {etapa ? (
          <span className="text-caption text-muted-foreground" role="status">
            {etapa}
          </span>
        ) : null}
      </div>

      <ActionFeedback mensagemDeSucesso="Arte conferida e salva." resultado={resultado} />
      {avisos.map((aviso) => (
        <p className="text-caption text-warning" key={aviso} role="status">
          {aviso}
        </p>
      ))}
    </div>
  )
}
