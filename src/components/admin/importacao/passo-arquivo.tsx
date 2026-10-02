'use client'

import { SeletorDeArquivo } from '@/components/admin/seletor-de-arquivo'

import type { TipoDaImportacao } from './assistente'

/**
 * Primeiro passo (doc 06): a lista de presença e a de palestrantes nunca saem
 * da mesma fonte, então a pergunta vem antes do arquivo. A escolha fixa o
 * modelo do lote inteiro; a planilha com coluna de tipo é o caso raro.
 */
export function PassoArquivo({
  tipos,
  tipoId,
  ocupado,
  aoEscolherTipo,
  aoEscolherArquivo,
}: {
  tipos: TipoDaImportacao[]
  tipoId: string | null | undefined
  ocupado: boolean
  aoEscolherTipo: (tipoId: string | null) => void
  aoEscolherArquivo: (arquivo: File) => void
}) {
  const algumComModelo = tipos.some((tipo) => tipo.temModelo)

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Tipo de participação</legend>
        {tipos.map((tipo) => (
          <label className="flex items-center gap-3" key={tipo.id}>
            <input
              checked={tipoId === tipo.id}
              className="accent-primary size-4"
              disabled={!tipo.temModelo || ocupado}
              name="tipo"
              onChange={() => aoEscolherTipo(tipo.id)}
              type="radio"
              value={tipo.id}
            />
            <span className={tipo.temModelo ? '' : 'text-muted-foreground'}>
              {tipo.label}
              {tipo.temModelo ? null : ' (ainda sem modelo de certificado)'}
            </span>
          </label>
        ))}
        <label className="flex items-center gap-3">
          <input
            checked={tipoId === null}
            className="accent-primary size-4"
            disabled={!algumComModelo || ocupado}
            name="tipo"
            onChange={() => aoEscolherTipo(null)}
            type="radio"
            value=""
          />
          <span>Vários tipos: a planilha tem uma coluna com o tipo de cada pessoa</span>
        </label>
        {algumComModelo ? null : (
          <p className="text-caption text-muted-foreground">
            Nenhum tipo tem modelo de certificado ainda. Escolha um modelo para o tipo na
            página do evento e volte aqui.
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <SeletorDeArquivo
          accept=".csv,.txt,text/csv,text/plain"
          aoEscolher={aoEscolherArquivo}
          desabilitado={tipoId === undefined || ocupado}
          rotulo={ocupado ? 'Lendo a planilha...' : 'Escolher a planilha'}
        />
        <p className="text-caption text-muted-foreground">
          CSV ou TXT, até 2 MB e 5.000 linhas. No Excel: Arquivo, Salvar como, CSV
          (separado por ponto e vírgula). No Google Planilhas: Arquivo, Fazer download,
          Valores separados por vírgula. Nada é gravado antes da prévia.
        </p>
      </div>
    </div>
  )
}
