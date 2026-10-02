'use client'

import type { listImportRows } from '@/actions/imports'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateShort } from '@/features/certificate/format'

import { CAMPOS_COMPARADOS, ROTULO_DA_ACAO, type AcaoDaLinha } from './rotulos'

export type LinhaDaPrevia = Extract<
  Awaited<ReturnType<typeof listImportRows>>,
  { ok: true }
>['data']['rows'][number]

type Resolucao = 'same_person' | 'different_person' | 'skip'

function valorParaTela(
  chave: (typeof CAMPOS_COMPARADOS)[number]['chave'],
  valor: unknown,
) {
  if (valor === null || valor === undefined || valor === '') return 'sem valor'
  if (chave === 'birthDate') return formatDateShort(String(valor))
  if (chave === 'hours') return `${String(valor).replace('.', ',')} h`
  return String(valor)
}

/** Os campos que a linha preencheu e que diferem do que já está no evento. */
function diferencas(linha: LinhaDaPrevia) {
  if (!linha.before) return []
  const antes = linha.before
  const campos: { rotulo: string; antes: string; depois: string }[] =
    CAMPOS_COMPARADOS.filter(({ chave }) => {
      const depois = linha[chave]
      // Vazio na planilha é "sem informação": não muda nada (doc 06).
      return (
        depois !== null &&
        depois !== undefined &&
        String(depois) !== String(antes[chave] ?? '')
      )
    }).map(({ chave, rotulo }) => ({
      rotulo,
      antes: valorParaTela(chave, antes[chave]),
      depois: valorParaTela(chave, linha[chave]),
    }))
  for (const [chave, valor] of Object.entries(linha.data)) {
    const anterior = antes.data?.[chave]
    if (JSON.stringify(anterior) !== JSON.stringify(valor)) {
      campos.push({
        rotulo: chave,
        antes: anterior === undefined ? 'sem valor' : String(anterior),
        depois: String(valor),
      })
    }
  }
  return campos
}

export function LinhaDaPreviaItem({
  linha,
  ocupado,
  aoResolver,
}: {
  linha: LinhaDaPrevia
  ocupado: boolean
  aoResolver: (rowNumber: number, resolucao: Resolucao) => void
}) {
  const acao = linha.action as AcaoDaLinha | null
  const decideAqui = acao === 'needs_decision' && linha.personRow === linha.rowNumber
  const mudancas = acao === 'update' || decideAqui ? diferencas(linha) : []

  return (
    <li className="border-border flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-caption text-muted-foreground">
          Linha {linha.rowNumber}
        </span>
        <span className="font-medium">{linha.fullName ?? 'Sem nome'}</span>
        {acao ? (
          <Badge variant={acao === 'error' ? 'destructive' : 'outline'}>
            {ROTULO_DA_ACAO[acao]}
          </Badge>
        ) : null}
      </div>

      {linha.issues.length > 0 ? (
        <ul className="text-caption flex flex-col gap-1">
          {linha.issues.map((problema, i) => (
            <li
              className={
                problema.severity === 'error'
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }
              key={`${problema.code}-${i}`}
            >
              {problema.detail ?? problema.code}
            </li>
          ))}
        </ul>
      ) : null}

      {decideAqui && linha.before ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="bg-surface rounded-md p-3">
            <p className="text-caption text-muted-foreground mb-1">Na planilha</p>
            <p>{linha.fullName}</p>
            <p className="text-caption">{linha.email ?? 'sem e-mail'}</p>
            <p className="text-caption">
              {linha.birthDate ? formatDateShort(linha.birthDate) : 'sem nascimento'}
            </p>
            <p className="text-caption">{linha.cpf ?? 'sem CPF'}</p>
          </div>
          <div className="bg-surface rounded-md p-3">
            <p className="text-caption text-muted-foreground mb-1">Já no evento</p>
            <p>{linha.before.fullName}</p>
            <p className="text-caption">{linha.before.email ?? 'sem e-mail'}</p>
            <p className="text-caption">
              {linha.before.birthDate
                ? formatDateShort(linha.before.birthDate)
                : 'sem nascimento'}
            </p>
            <p className="text-caption">{linha.before.cpf ?? 'sem CPF'}</p>
          </div>
        </div>
      ) : null}

      {acao === 'update' && mudancas.length > 0 ? (
        <dl className="text-caption grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {mudancas.map((mudanca) => (
            <div className="contents" key={mudanca.rotulo}>
              <dt className="text-muted-foreground">{mudanca.rotulo}</dt>
              <dd>
                <span className="sr-only">de </span>
                <span className="line-through">{mudanca.antes}</span>
                <span aria-hidden="true"> → </span>
                <span className="sr-only"> para </span>
                {mudanca.depois}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {decideAqui ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={ocupado}
            onClick={() => aoResolver(linha.rowNumber, 'same_person')}
            size="sm"
            type="button"
          >
            É a mesma pessoa
          </Button>
          <Button
            disabled={ocupado}
            onClick={() => aoResolver(linha.rowNumber, 'different_person')}
            size="sm"
            type="button"
            variant="outline"
          >
            É outra pessoa
          </Button>
          <Button
            disabled={ocupado}
            onClick={() => aoResolver(linha.rowNumber, 'skip')}
            size="sm"
            type="button"
            variant="ghost"
          >
            Pular linha
          </Button>
        </div>
      ) : null}
    </li>
  )
}
