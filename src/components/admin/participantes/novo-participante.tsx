'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createCertificateManually } from '@/actions/certificates'
import { falhaDeConexao, type ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { Campo } from './editar-participante'

const VAZIO = { fullName: '', email: '', birthDate: '', cpf: '', hours: '' }

/**
 * Uma pessoa à mão (doc 07), com a mesma validação da importação. O caso é o
 * de quem chegou atrasado e não está na planilha.
 */
export function NovoParticipante({
  eventId,
  tipos,
}: {
  eventId: string
  tipos: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [tipoId, setTipoId] = useState(tipos[0]?.id ?? '')
  const [valores, setValores] = useState(VAZIO)
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  if (tipos.length === 0) return null

  const campo = (chave: keyof typeof VAZIO) => ({
    id: `novo-${chave}`,
    value: valores[chave],
    onChange: (evento: React.ChangeEvent<HTMLInputElement>) =>
      setValores({ ...valores, [chave]: evento.target.value }),
  })
  const erros = resultado && !resultado.ok ? (resultado.error.fieldErrors ?? {}) : {}

  async function criar(evento: React.FormEvent) {
    evento.preventDefault()
    setOcupado(true)
    try {
      const resposta = await createCertificateManually({
        eventId,
        participationTypeId: tipoId,
        participant: {
          fullName: valores.fullName,
          email: valores.email,
          birthDate: valores.birthDate,
          cpf: valores.cpf,
        },
        hours: valores.hours,
      })
      setResultado(resposta)
      if (resposta.ok) {
        setValores(VAZIO)
        router.refresh()
      }
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  return (
    <details className="border-border rounded-md border p-4">
      <summary className="cursor-pointer font-medium">Adicionar uma pessoa à mão</summary>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(evento) => void criar(evento)}
      >
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className="text-sm font-medium" htmlFor="novo-tipo">
            Tipo de participação
          </label>
          <select
            className="border-input bg-background h-9 rounded-md border px-3"
            id="novo-tipo"
            onChange={(evento) => setTipoId(evento.target.value)}
            value={tipoId}
          >
            {tipos.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.label}
              </option>
            ))}
          </select>
        </div>
        <Campo erro={erros.fullName} id="novo-fullName" rotulo="Nome completo">
          <Input {...campo('fullName')} required />
        </Campo>
        <Campo erro={erros.email} id="novo-email" rotulo="E-mail">
          <Input {...campo('email')} type="email" />
        </Campo>
        <Campo erro={erros.birthDate} id="novo-birthDate" rotulo="Data de nascimento">
          <Input {...campo('birthDate')} placeholder="dd/mm/aaaa" />
        </Campo>
        <Campo erro={erros.cpf} id="novo-cpf" rotulo="CPF">
          <Input {...campo('cpf')} inputMode="numeric" />
        </Campo>
        <Campo
          erro={erros.hours}
          id="novo-hours"
          rotulo="Carga horária (vazio usa a do tipo)"
        >
          <Input {...campo('hours')} inputMode="decimal" />
        </Campo>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <ActionFeedback
            mensagemDeSucesso="Pessoa adicionada, com o certificado."
            resultado={resultado}
          />
          <Button className="w-fit" disabled={ocupado} type="submit">
            {ocupado ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </div>
      </form>
    </details>
  )
}
