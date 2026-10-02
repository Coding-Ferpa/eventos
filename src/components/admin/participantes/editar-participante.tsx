'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { updateCertificate, updateParticipant } from '@/actions/certificates'
import { falhaDeConexao, type ActionResult } from '@/actions/result'
import { ActionFeedback } from '@/components/admin/action-feedback'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDateShort } from '@/features/certificate/format'

import type { LinhaDeCertificado } from './lista'

/**
 * Edição manual de uma pessoa (doc 07): a mesma validação da importação. Só o
 * que mudou vai para a action; campo esvaziado apaga. O CPF não volta para a
 * tela: digita-se um novo, ou fica o que está.
 */
export function EditarParticipante({ linha }: { linha: LinhaDeCertificado }) {
  const router = useRouter()
  const inicial = {
    fullName: linha.fullName,
    email: linha.email ?? '',
    birthDate: linha.birthDate ? formatDateShort(linha.birthDate) : '',
    hours: String(linha.hours).replace('.', ','),
  }
  const [aberto, setAberto] = useState(false)
  const [valores, setValores] = useState(inicial)
  const [cpf, setCpf] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<ActionResult<unknown> | null>(null)

  const campo = (chave: keyof typeof inicial) => ({
    value: valores[chave],
    onChange: (evento: React.ChangeEvent<HTMLInputElement>) =>
      setValores({ ...valores, [chave]: evento.target.value }),
  })
  const erros = resultado && !resultado.ok ? (resultado.error.fieldErrors ?? {}) : {}

  async function salvar() {
    setOcupado(true)
    try {
      const pessoa = {
        ...(valores.fullName !== inicial.fullName ? { fullName: valores.fullName } : {}),
        ...(valores.email !== inicial.email ? { email: valores.email || null } : {}),
        ...(valores.birthDate !== inicial.birthDate
          ? { birthDate: valores.birthDate || null }
          : {}),
        ...(cpf ? { cpf } : {}),
      }
      if (Object.keys(pessoa).length > 0) {
        const resposta = await updateParticipant({ id: linha.participantId, ...pessoa })
        if (!resposta.ok) return setResultado(resposta)
      }
      if (valores.hours !== inicial.hours) {
        const resposta = await updateCertificate({
          id: linha.certificateId,
          hours: valores.hours,
        })
        if (!resposta.ok) return setResultado(resposta)
      }
      setResultado(null)
      setAberto(false)
      router.refresh()
    } catch {
      setResultado(falhaDeConexao())
    } finally {
      setOcupado(false)
    }
  }

  return (
    <AlertDialog onOpenChange={setAberto} open={aberto}>
      <AlertDialogTrigger asChild>
        <Button size="sm" type="button" variant="ghost">
          Editar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Editar {linha.fullName}</AlertDialogTitle>
          <AlertDialogDescription>
            Mudar o nome atualiza todos os certificados da pessoa; o código não muda.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-3">
          <Campo
            erro={erros.fullName}
            id={`nome-${linha.certificateId}`}
            rotulo="Nome completo"
          >
            <Input {...campo('fullName')} id={`nome-${linha.certificateId}`} />
          </Campo>
          <Campo erro={erros.email} id={`email-${linha.certificateId}`} rotulo="E-mail">
            <Input {...campo('email')} id={`email-${linha.certificateId}`} type="email" />
          </Campo>
          <Campo
            erro={erros.birthDate}
            id={`nascimento-${linha.certificateId}`}
            rotulo="Data de nascimento"
          >
            <Input
              {...campo('birthDate')}
              id={`nascimento-${linha.certificateId}`}
              placeholder="dd/mm/aaaa"
            />
          </Campo>
          <Campo
            erro={erros.cpf}
            id={`cpf-${linha.certificateId}`}
            rotulo={
              linha.cpfLast3 ? `Novo CPF (o atual termina em ${linha.cpfLast3})` : 'CPF'
            }
          >
            <Input
              id={`cpf-${linha.certificateId}`}
              inputMode="numeric"
              onChange={(e) => setCpf(e.target.value)}
              value={cpf}
            />
          </Campo>
          <Campo
            erro={erros.hours}
            id={`horas-${linha.certificateId}`}
            rotulo={`Carga horária (${linha.tipo})`}
          >
            <Input
              {...campo('hours')}
              id={`horas-${linha.certificateId}`}
              inputMode="decimal"
            />
          </Campo>
        </div>
        <ActionFeedback resultado={resultado} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <Button disabled={ocupado} onClick={() => void salvar()} type="button">
            {ocupado ? 'Salvando...' : 'Salvar'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function Campo({
  id,
  rotulo,
  erro,
  children,
}: {
  id: string
  rotulo: string
  erro?: string[]
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro?.map((mensagem) => (
        <p className="text-caption text-destructive" key={mensagem}>
          {mensagem}
        </p>
      ))}
    </div>
  )
}
