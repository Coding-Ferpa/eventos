'use client'

import { useEffect, useState } from 'react'

import {
  applyImport,
  discardImport,
  listImportRows,
  resolveImportRow,
  type ImportSummary,
} from '@/actions/imports'
import { actionError, falhaDeConexao, type ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'

import type { Previa } from './assistente'
import { LinhaDaPreviaItem, type LinhaDaPrevia } from './linha-da-previa'
import { FILTROS_DA_PREVIA, ROTULO_DO_AVISO, type FiltroDaPrevia } from './rotulos'

/**
 * Terceiro passo (doc 06): o resumo em certificados, as linhas por filtro e as
 * decisões. Aplicar só existe sem decisão pendente. Se a lista mudou desde a
 * prévia, a aplicação não escreve nada e devolve a prévia nova, que substitui
 * esta com o aviso.
 */
export function PassoPrevia({
  previa,
  multiplosTipos,
  aoMudarPrevia,
  aoAplicar,
  aoDescartar,
}: {
  previa: Previa
  multiplosTipos: boolean
  aoMudarPrevia: (previa: Previa) => void
  aoAplicar: (summary: ImportSummary) => void
  aoDescartar: () => void
}) {
  const [filtro, setFiltro] = useState<FiltroDaPrevia>(
    previa.summary.needs_decision > 0
      ? 'needs_decision'
      : previa.summary.error > 0
        ? 'error'
        : 'all',
  )
  const [linhas, setLinhas] = useState<LinhaDaPrevia[]>([])
  const [proximo, setProximo] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)
  const [mudouDesdeAPrevia, setMudouDesdeAPrevia] = useState(false)

  // A lista recarrega quando o filtro muda e quando a prévia muda (decisão,
  // prévia nova): o digest é o que identifica "esta" prévia. Resposta que
  // chega depois de outro filtro escolhido é descartada.
  useEffect(() => {
    let atual = true
    void listImportRows({ batchId: previa.batchId, filter: filtro, cursor: 0 }).then(
      (pagina) => {
        if (!atual) return
        if (!pagina.ok) return setResultado(pagina)
        setLinhas(pagina.data.rows)
        setProximo(pagina.data.nextCursor)
      },
    )
    return () => {
      atual = false
    }
  }, [previa.batchId, previa.previewDigest, filtro])

  async function carregarMais(cursor: number) {
    const pagina = await listImportRows({
      batchId: previa.batchId,
      filter: filtro,
      cursor,
    })
    if (!pagina.ok) return setResultado(pagina)
    setLinhas((atuais) => [...atuais, ...pagina.data.rows])
    setProximo(pagina.data.nextCursor)
  }

  async function resolver(
    rowNumber: number,
    resolution: 'same_person' | 'different_person' | 'skip',
  ) {
    setOcupado(true)
    try {
      const resposta = await resolveImportRow({
        batchId: previa.batchId,
        rowNumber,
        resolution,
      })
      if (!resposta.ok) return setResultado(resposta)
      setResultado(null)
      aoMudarPrevia({ ...previa, ...resposta.data })
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  async function aplicar() {
    setOcupado(true)
    setResultado(null)
    try {
      const resposta = await applyImport({
        batchId: previa.batchId,
        previewDigest: previa.previewDigest,
      })
      if (!resposta.ok) return setResultado(resposta)
      const { status, summary, previewDigest } = resposta.data
      if (status === 'applied') return aoAplicar(summary)
      if (status === 'preview_stale') {
        setMudouDesdeAPrevia(true)
        return aoMudarPrevia({ ...previa, summary, previewDigest: previewDigest! })
      }
      if (status === 'decisions_pending') {
        return setResultado(actionError('conflict', 'Ainda há linhas pedindo decisão.'))
      }
      setResultado(
        actionError(
          'validation_error',
          'A aplicação falhou e nada foi gravado. Descarte esta importação e tente de novo; se repetir, fale com quem cuida do sistema.',
        ),
      )
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  async function descartar() {
    setOcupado(true)
    try {
      const resposta = await discardImport({ batchId: previa.batchId })
      if (!resposta.ok) return setResultado(resposta)
      aoDescartar()
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  const { summary } = previa
  const nadaAFazer = summary.create + summary.update === 0
  const avisos = Object.entries(summary.warnings).filter(([, n]) => n > 0)

  return (
    <div className="flex flex-col gap-6">
      {mudouDesdeAPrevia ? (
        <p
          className="border-warning text-caption rounded-md border px-3 py-2"
          role="alert"
        >
          A lista mudou desde a prévia: alguém editou o evento nesse meio tempo. Esta é a
          prévia nova; confira antes de aplicar.
        </p>
      ) : null}

      <dl
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        aria-label="Resumo, em certificados"
      >
        <Contador
          rotulo="A criar"
          valor={summary.create}
          detalhe={`${summary.new_people} pessoas novas`}
        />
        <Contador rotulo="A atualizar" valor={summary.update} />
        <Contador rotulo="Inalterados" valor={summary.unchanged} />
        <Contador
          rotulo="Com erro"
          valor={summary.error}
          detalhe="não impedem as demais"
        />
        <Contador
          rotulo="Pedem decisão"
          valor={summary.needs_decision}
          detalhe="bloqueiam a aplicação"
        />
        {multiplosTipos ? null : (
          <Contador
            rotulo="Ausentes no arquivo"
            valor={summary.absent}
            detalhe="nada é removido"
          />
        )}
      </dl>

      {avisos.length > 0 ? (
        <ul className="text-caption text-muted-foreground flex flex-col gap-1">
          {avisos.map(([codigo, n]) => (
            <li key={codigo}>
              {n} {ROTULO_DO_AVISO[codigo] ?? codigo}
            </li>
          ))}
        </ul>
      ) : null}

      <div aria-label="Filtrar linhas" className="flex flex-wrap gap-2" role="group">
        {FILTROS_DA_PREVIA.map((opcao) => (
          <Button
            aria-pressed={filtro === opcao.valor}
            key={opcao.valor}
            onClick={() => setFiltro(opcao.valor)}
            size="sm"
            type="button"
            variant={filtro === opcao.valor ? 'default' : 'outline'}
          >
            {opcao.rotulo}
          </Button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma linha neste filtro.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {linhas.map((linha) => (
            <LinhaDaPreviaItem
              aoResolver={(rowNumber, resolucao) => void resolver(rowNumber, resolucao)}
              key={linha.rowNumber}
              linha={linha}
              ocupado={ocupado}
            />
          ))}
        </ol>
      )}
      {proximo !== null ? (
        <Button
          className="w-fit"
          onClick={() => void carregarMais(proximo)}
          type="button"
          variant="outline"
        >
          Mostrar mais linhas
        </Button>
      ) : null}

      <ActionFeedback resultado={resultado} />

      <div className="flex flex-wrap gap-3">
        <Button
          disabled={ocupado}
          onClick={() => void descartar()}
          type="button"
          variant="outline"
        >
          Descartar
        </Button>
        <Button
          disabled={ocupado || summary.needs_decision > 0 || nadaAFazer}
          onClick={() => void aplicar()}
          type="button"
        >
          {ocupado ? 'Aplicando...' : 'Aplicar a importação'}
        </Button>
      </div>
      {summary.needs_decision > 0 ? (
        <p className="text-caption text-muted-foreground">
          Decida as linhas marcadas como possível duplicata para poder aplicar.
        </p>
      ) : nadaAFazer ? (
        <p className="text-caption text-muted-foreground">
          Nada a criar nem a atualizar.
        </p>
      ) : null}
    </div>
  )
}

function Contador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: number
  detalhe?: string
}) {
  return (
    <div className="border-border flex flex-col gap-0.5 rounded-md border p-3">
      <dt className="text-caption text-muted-foreground">{rotulo}</dt>
      <dd className="text-h3 font-semibold">{valor}</dd>
      {detalhe ? <dd className="text-caption text-muted-foreground">{detalhe}</dd> : null}
    </div>
  )
}
