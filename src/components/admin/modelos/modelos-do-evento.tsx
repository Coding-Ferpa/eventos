'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import type { ActionResult } from '@/actions/result'
import { createTemplate } from '@/actions/templates'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Os modelos de certificado do evento (doc 04): cada tipo de participação
 * aponta para um, e vários tipos podem usar o mesmo.
 */

export type ModeloNaLista = {
  id: string
  name: string
  status: 'draft' | 'published'
  version: number
  temArte: boolean
}

export function ModelosDoEvento({
  eventId,
  modelos,
}: {
  eventId: string
  modelos: ModeloNaLista[]
}) {
  const router = useRouter()
  const idDoNome = useId()
  const [nome, setNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  async function criar(evento: React.FormEvent) {
    evento.preventDefault()
    setCriando(true)
    const resposta = await createTemplate({ eventId, name: nome })
    setCriando(false)
    setResultado(resposta)
    if (resposta.ok) router.push(`/admin/eventos/${eventId}/modelos/${resposta.data.id}`)
  }

  return (
    <div className="flex flex-col gap-4">
      {modelos.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {modelos.map((modelo) => (
            <li
              className="border-border flex items-center justify-between gap-3 rounded-md border p-3"
              key={modelo.id}
            >
              <Link
                className="font-medium hover:underline"
                href={`/admin/eventos/${eventId}/modelos/${modelo.id}`}
              >
                {modelo.name}
              </Link>
              <span className="flex items-center gap-2">
                {!modelo.temArte ? <Badge variant="outline">Sem arte</Badge> : null}
                {modelo.status === 'published' ? (
                  <Badge variant="secondary">Publicado, versão {modelo.version}</Badge>
                ) : (
                  <Badge variant="outline">Rascunho</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-caption text-muted-foreground">Nenhum modelo ainda.</p>
      )}

      <form
        className="flex flex-wrap items-end gap-3"
        noValidate
        onSubmit={(evento) => void criar(evento)}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={idDoNome}>Nome do modelo novo</Label>
          <Input
            className="w-72"
            id={idDoNome}
            onChange={(evento) => setNome(evento.target.value)}
            placeholder="Participante 2026"
            value={nome}
          />
        </div>
        <Button disabled={criando} type="submit">
          Criar modelo
        </Button>
      </form>
      <ActionFeedback resultado={resultado} />
    </div>
  )
}
