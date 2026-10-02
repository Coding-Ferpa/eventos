'use client'

import { useEffect, useRef, useState } from 'react'

import { inspectCsv, stageImport, type ImportSummary } from '@/actions/imports'
import { actionError, falhaDeConexao, type ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'

import { PassoArquivo } from './passo-arquivo'
import { PassoConcluido } from './passo-concluido'
import { PassoMapeamento } from './passo-mapeamento'
import { PassoPrevia } from './passo-previa'

/**
 * O assistente de 4 passos (doc 06): de quem é a lista e o arquivo; o
 * mapeamento; a prévia; a aplicação. O arquivo fica na memória do navegador e
 * sobe duas vezes, na inspeção e na prévia: o servidor nunca o guarda
 * (ADR-0011).
 */

export type TipoDaImportacao = { id: string; label: string; temModelo: boolean }

type Inspecao = Extract<Awaited<ReturnType<typeof inspectCsv>>, { ok: true }>['data']
export type InspecaoDaTela = Inspecao
export type Previa = { batchId: string; summary: ImportSummary; previewDigest: string }

const LIMITE_DO_ARQUIVO = 2 * 1024 * 1024

type Estado =
  | { passo: 'arquivo' }
  | { passo: 'mapeamento'; arquivo: File; inspecao: Inspecao }
  | { passo: 'previa'; arquivo: File; inspecao: Inspecao; previa: Previa }
  | { passo: 'concluido'; summary: ImportSummary }

function formulario(arquivo: File, campos: Record<string, string>) {
  const dados = new FormData()
  dados.set('file', arquivo)
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor)
  return dados
}

export function AssistenteDeImportacao({
  eventId,
  tipos,
  buscaPorCpf,
}: {
  eventId: string
  tipos: TipoDaImportacao[]
  buscaPorCpf: boolean
}) {
  const [estado, setEstado] = useState<Estado>({ passo: 'arquivo' })
  // `undefined`: ainda não escolheu; `null`: planilha com coluna de tipo.
  const [tipoId, setTipoId] = useState<string | null | undefined>(undefined)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  // A cada passo, o foco vai para o título dele: quem usa leitor de tela ouve
  // onde está, e quem usa teclado não fica preso no botão que sumiu.
  const titulo = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titulo.current?.focus()
  }, [estado.passo])

  const campos = () => ({ eventId, participationTypeId: tipoId ?? '' })

  async function inspecionar(arquivo: File) {
    if (arquivo.size > LIMITE_DO_ARQUIVO) {
      setResultado(actionError('file_too_large', 'O arquivo pode ter até 2 MB.'))
      return
    }
    setOcupado(true)
    setResultado(null)
    try {
      const inspecao = await inspectCsv(formulario(arquivo, campos()))
      if (!inspecao.ok) return setResultado(inspecao)
      setMapping(inspecao.data.suggestedMapping as Record<string, string>)
      setEstado({ passo: 'mapeamento', arquivo, inspecao: inspecao.data })
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  async function prever() {
    if (estado.passo !== 'mapeamento') return
    setOcupado(true)
    setResultado(null)
    try {
      const previa = await stageImport(
        formulario(estado.arquivo, { ...campos(), mapping: JSON.stringify(mapping) }),
      )
      if (!previa.ok) return setResultado(previa)
      setEstado({ ...estado, passo: 'previa', previa: previa.data })
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  const TITULOS = {
    arquivo: '1. De quem é esta lista?',
    mapeamento: '2. Que coluna é o quê',
    previa: '3. Prévia',
    concluido: '4. Importação aplicada',
  } as const

  return (
    <section aria-labelledby="titulo-do-passo" className="flex flex-col gap-6">
      <h2
        className="text-h3 font-semibold outline-none"
        id="titulo-do-passo"
        ref={titulo}
        tabIndex={-1}
      >
        {TITULOS[estado.passo]}
      </h2>

      {estado.passo === 'arquivo' ? (
        <PassoArquivo
          aoEscolherArquivo={(arquivo) => void inspecionar(arquivo)}
          aoEscolherTipo={setTipoId}
          ocupado={ocupado}
          tipoId={tipoId}
          tipos={tipos}
        />
      ) : null}

      {estado.passo === 'mapeamento' ? (
        <PassoMapeamento
          aoAvancar={() => void prever()}
          aoMudar={setMapping}
          aoVoltar={() => setEstado({ passo: 'arquivo' })}
          buscaPorCpf={buscaPorCpf}
          inspecao={estado.inspecao}
          mapping={mapping}
          ocupado={ocupado}
        />
      ) : null}

      {estado.passo === 'previa' ? (
        <PassoPrevia
          aoAplicar={(summary) => setEstado({ passo: 'concluido', summary })}
          aoDescartar={() => setEstado({ passo: 'arquivo' })}
          aoMudarPrevia={(previa) => setEstado({ ...estado, previa })}
          multiplosTipos={tipoId === null}
          previa={estado.previa}
        />
      ) : null}

      {estado.passo === 'concluido' ? (
        <PassoConcluido
          aoImportarOutra={() => {
            setTipoId(undefined)
            setEstado({ passo: 'arquivo' })
          }}
          eventId={eventId}
          summary={estado.summary}
        />
      ) : null}

      <ActionFeedback resultado={resultado} />
    </section>
  )
}
