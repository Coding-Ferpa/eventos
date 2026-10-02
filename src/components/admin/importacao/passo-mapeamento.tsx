'use client'

import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDateShort } from '@/features/certificate/format'

import type { InspecaoDaTela } from './assistente'
import { ROTULO_DO_DELIMITADOR, ROTULO_DO_ENCODING } from './rotulos'

const NAO_IMPORTAR = ''

/**
 * Segundo passo (doc 06): as 10 primeiras linhas já decodificadas, para o
 * acento errado aparecer aqui e não no banco, e um seletor por alvo. A
 * sugestão vem pronta e nunca é aplicada sem o admin ver; o servidor confere
 * de novo na prévia.
 */
export function PassoMapeamento({
  inspecao,
  mapping,
  buscaPorCpf,
  ocupado,
  aoMudar,
  aoVoltar,
  aoAvancar,
}: {
  inspecao: InspecaoDaTela
  mapping: Record<string, string>
  buscaPorCpf: boolean
  ocupado: boolean
  aoMudar: (mapping: Record<string, string>) => void
  aoVoltar: () => void
  aoAvancar: () => void
}) {
  const prefixo = useId()
  const faltando = inspecao.targets.filter(
    (alvo) => alvo.required && !mapping[alvo.target],
  )

  function escolher(alvo: string, cabecalho: string) {
    const novo = { ...mapping }
    if (cabecalho === NAO_IMPORTAR) delete novo[alvo]
    else novo[alvo] = cabecalho
    aoMudar(novo)
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-caption text-muted-foreground">
        {inspecao.fileName}: {inspecao.rowCount}{' '}
        {inspecao.rowCount === 1 ? 'linha' : 'linhas'}, codificação{' '}
        {ROTULO_DO_ENCODING[inspecao.encoding]}, separada por{' '}
        {ROTULO_DO_DELIMITADOR[inspecao.delimiter]}.
      </p>

      {inspecao.warnings.map((aviso) => (
        <p
          className="border-warning text-caption rounded-md border px-3 py-2"
          key={aviso.code}
          role="status"
        >
          {aviso.code === 'MOJIBAKE_SUSPECTED'
            ? 'Alguns acentos parecem ter chegado estragados de outro sistema (como Ã§ no lugar de ç). Confira as linhas abaixo: daqui não dá para consertar, só na planilha.'
            : `Este mesmo arquivo já foi aplicado em ${formatDateShort(aviso.appliedAt!.slice(0, 10))}. Reaplicar não duplica ninguém.`}
        </p>
      ))}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <caption className="sr-only">
            As 10 primeiras linhas do arquivo, já decodificadas
          </caption>
          <TableHeader>
            <TableRow>
              {inspecao.headers.map((cabecalho) => (
                <TableHead key={cabecalho}>{cabecalho}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {inspecao.sampleRows.map((linha, i) => (
              <TableRow key={i}>
                {linha.map((celula, j) => (
                  <TableCell className="whitespace-nowrap" key={j}>
                    {celula}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Que coluna é o quê</legend>
        {inspecao.targets.map((alvo) => {
          const id = `${prefixo}-${alvo.target}`
          return (
            <div
              className="grid items-center gap-2 sm:grid-cols-[14rem_1fr]"
              key={alvo.target}
            >
              <label className="flex items-center gap-2" htmlFor={id}>
                {alvo.label}
                {alvo.required ? <Badge variant="outline">obrigatório</Badge> : null}
              </label>
              <select
                className="border-input bg-background h-9 rounded-md border px-3"
                disabled={ocupado}
                id={id}
                onChange={(evento) => escolher(alvo.target, evento.target.value)}
                value={mapping[alvo.target] ?? NAO_IMPORTAR}
              >
                <option value={NAO_IMPORTAR}>Não importar</option>
                {inspecao.headers.map((cabecalho) => (
                  <option key={cabecalho} value={cabecalho}>
                    {cabecalho}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </fieldset>

      {buscaPorCpf && !mapping.cpf ? (
        <p
          className="border-warning text-caption rounded-md border px-3 py-2"
          role="status"
        >
          Sem CPF, estas pessoas não poderão buscar o certificado por CPF.
        </p>
      ) : null}
      {faltando.length > 0 ? (
        <p className="text-caption text-destructive" role="status">
          Escolha a coluna de {faltando.map((alvo) => alvo.label).join(', ')} para
          continuar.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button disabled={ocupado} onClick={aoVoltar} type="button" variant="outline">
          Voltar
        </Button>
        <Button
          disabled={ocupado || faltando.length > 0}
          onClick={aoAvancar}
          type="button"
        >
          {ocupado ? 'Preparando a prévia...' : 'Ver a prévia'}
        </Button>
      </div>
    </div>
  )
}
