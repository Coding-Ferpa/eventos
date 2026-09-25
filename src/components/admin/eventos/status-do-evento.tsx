'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { setEventStatus } from '@/actions/events'
import type { ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  problemaNaTransicao,
  STATUS_DO_EVENTO,
  type StatusDoEvento,
} from '@/lib/schemas/event'

import { ROTULO_DO_STATUS_NO_ADMIN } from './rotulos'

/**
 * Troca de status (doc 07). As opções que a regra recusa aparecem
 * desabilitadas, com o motivo logo abaixo: quem abre o seletor vê que
 * "certificados disponíveis" existe e por onde se chega lá.
 */
export function StatusDoEvento({ id, atual }: { id: string; atual: StatusDoEvento }) {
  const router = useRouter()
  const [escolhido, setEscolhido] = useState<StatusDoEvento>(atual)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  async function mudar() {
    setEnviando(true)
    const resposta = await setEventStatus({ id, status: escolhido })
    setResultado(resposta)
    setEnviando(false)
    if (resposta.ok) router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1.5 sm:w-72">
          <Label htmlFor="status-do-evento">Status</Label>
          <Select
            onValueChange={(valor) => setEscolhido(valor as StatusDoEvento)}
            value={escolhido}
          >
            <SelectTrigger id="status-do-evento">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_DO_EVENTO.map((status) => (
                <SelectItem
                  disabled={problemaNaTransicao(atual, status) !== null}
                  key={status}
                  value={status}
                >
                  {ROTULO_DO_STATUS_NO_ADMIN[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={enviando || escolhido === atual} onClick={mudar} type="button">
          Mudar status
        </Button>
      </div>

      <p className="text-caption text-muted-foreground">
        “Certificados disponíveis” não se escolhe aqui: os certificados entram no ar pela
        liberação, que confere antes se falta alguma coisa.
        {atual === 'draft'
          ? ' Ao sair do rascunho, o endereço do evento fica fixo.'
          : ' Um evento publicado não volta ao rascunho; para tirá-lo do catálogo, arquive.'}
      </p>

      <ActionFeedback mensagemDeSucesso="Status alterado." resultado={resultado} />
    </div>
  )
}
