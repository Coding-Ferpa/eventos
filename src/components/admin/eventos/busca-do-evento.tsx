'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { updateEvent } from '@/actions/events'
import type { ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { ConfiguracaoDeBusca } from '@/lib/schemas/event'

/**
 * Como o participante encontra o próprio certificado (doc 04, ADR-0009). CPF,
 * e-mail e nome são chaves independentes; a data de nascimento nunca é chave
 * sozinha. A regra vale no servidor, e a explicação fica aqui, na tela.
 */

const CHAVES = [
  { campo: 'searchByCpf', rotulo: 'CPF', ajuda: 'Só funciona se a planilha tiver CPF.' },
  { campo: 'searchByEmail', rotulo: 'E-mail', ajuda: 'O e-mail informado na inscrição.' },
  {
    campo: 'searchByName',
    rotulo: 'Nome completo',
    ajuda: 'Exatamente como na inscrição, sem abreviar.',
  },
] as const

export function BuscaDoEvento({ id, atual }: { id: string; atual: ConfiguracaoDeBusca }) {
  const router = useRouter()
  const [busca, setBusca] = useState(atual)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)
  const prefixo = useId()

  const erros = resultado && !resultado.ok ? (resultado.error.fieldErrors ?? {}) : {}

  async function salvar() {
    setEnviando(true)
    const resposta = await updateEvent({ id, ...busca })
    setResultado(resposta)
    setEnviando(false)
    if (resposta.ok) router.refresh()
  }

  function marcar(campo: keyof ConfiguracaoDeBusca, valor: boolean) {
    setBusca((anterior) => ({ ...anterior, [campo]: valor }))
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-medium">Chaves de busca</legend>
        {CHAVES.map((chave) => (
          <div className="flex items-start gap-3" key={chave.campo}>
            <Checkbox
              aria-describedby={`${prefixo}-${chave.campo}-ajuda`}
              checked={busca[chave.campo]}
              id={`${prefixo}-${chave.campo}`}
              onCheckedChange={(marcado) => marcar(chave.campo, marcado === true)}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor={`${prefixo}-${chave.campo}`}>{chave.rotulo}</Label>
              <p
                className="text-caption text-muted-foreground"
                id={`${prefixo}-${chave.campo}-ajuda`}
              >
                {chave.ajuda}
              </p>
            </div>
          </div>
        ))}
        {erros.searchByName ? (
          <p className="text-caption text-destructive">{erros.searchByName[0]}</p>
        ) : null}
      </fieldset>

      <div className="flex items-start gap-3">
        <Checkbox
          aria-describedby={`${prefixo}-nascimento-ajuda`}
          checked={busca.searchBirthDate}
          id={`${prefixo}-nascimento`}
          onCheckedChange={(marcado) => marcar('searchBirthDate', marcado === true)}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={`${prefixo}-nascimento`}>
            Pedir também a data de nascimento
          </Label>
          <p
            className="text-caption text-muted-foreground"
            id={`${prefixo}-nascimento-ajuda`}
          >
            Nunca é chave sozinha: desempata homônimos. No modo “qualquer um”, vale junto
            com o nome.
          </p>
          {erros.searchBirthDate ? (
            <p className="text-caption text-destructive">{erros.searchBirthDate[0]}</p>
          ) : null}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">Quando há mais de uma chave</legend>
        {(
          [
            ['any', 'Qualquer um', 'A pessoa escolhe uma das chaves e preenche só ela.'],
            ['all', 'Todos', 'A pessoa preenche todas as chaves ligadas.'],
          ] as const
        ).map(([valor, rotulo, ajuda]) => (
          <div className="flex items-start gap-3" key={valor}>
            <input
              aria-describedby={`${prefixo}-modo-${valor}-ajuda`}
              checked={busca.searchMode === valor}
              className="accent-primary mt-1"
              id={`${prefixo}-modo-${valor}`}
              name={`${prefixo}-modo`}
              onChange={() =>
                setBusca((anterior) => ({ ...anterior, searchMode: valor }))
              }
              type="radio"
              value={valor}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor={`${prefixo}-modo-${valor}`}>{rotulo}</Label>
              <p
                className="text-caption text-muted-foreground"
                id={`${prefixo}-modo-${valor}-ajuda`}
              >
                {ajuda}
              </p>
            </div>
          </div>
        ))}
      </fieldset>

      <ActionFeedback mensagemDeSucesso="Busca salva." resultado={resultado} />

      <Button className="w-fit" disabled={enviando} onClick={salvar} type="button">
        Salvar busca
      </Button>
    </div>
  )
}
