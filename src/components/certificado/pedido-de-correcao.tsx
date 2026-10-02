'use client'

import { useId, useState } from 'react'

/**
 * "Meu nome está errado" (doc 07). O pedido nunca sai da plataforma: vai para
 * a organização revisar, e o certificado corrigido mantém o mesmo código.
 */

type Estado =
  | { tipo: 'ocioso' }
  | { tipo: 'enviando' }
  | { tipo: 'enviado' }
  | { tipo: 'erro'; mensagem: string; campos: Record<string, string[]> }

const ENVIADO =
  'Pedido enviado. A organização vai revisar, e o certificado corrigido mantém o mesmo código. Não precisa pedir de novo.'

export function PedidoDeCorrecao({
  code,
  nomeAtual,
}: {
  code: string
  nomeAtual: string
}) {
  const id = useId()
  const [estado, setEstado] = useState<Estado>({ tipo: 'ocioso' })

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const dados = new FormData(evento.currentTarget)
    setEstado({ tipo: 'enviando' })
    try {
      const resposta = await fetch(`/api/certificados/${code}/correcao`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requested_name: dados.get('requested_name'),
          contact: dados.get('contact'),
          message: dados.get('message') || undefined,
        }),
      })
      if (resposta.status === 201) return setEstado({ tipo: 'enviado' })
      const problema = (await resposta.json()) as {
        detail?: string
        field_errors?: Record<string, string[]>
      }
      setEstado({
        tipo: 'erro',
        mensagem:
          problema.detail ??
          'Não conseguimos enviar o pedido. Tente de novo em instantes.',
        campos: problema.field_errors ?? {},
      })
    } catch {
      setEstado({
        tipo: 'erro',
        mensagem:
          'Não conseguimos falar com o servidor. Confira a conexão e tente de novo.',
        campos: {},
      })
    }
  }

  const campos = estado.tipo === 'erro' ? estado.campos : {}
  const campo = (
    nome: string,
    rotulo: string,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-caption font-medium" htmlFor={`${id}-${nome}`}>
        {rotulo}
      </label>
      <input
        aria-describedby={campos[nome] ? `${id}-${nome}-erro` : undefined}
        aria-invalid={campos[nome] ? true : undefined}
        className="border-input bg-background min-h-11 rounded-md border px-3"
        id={`${id}-${nome}`}
        name={nome}
        {...extra}
      />
      {campos[nome] ? (
        <p className="text-caption text-destructive" id={`${id}-${nome}-erro`}>
          {campos[nome]!.join(' ')}
        </p>
      ) : null}
    </div>
  )

  return (
    <details className="text-caption">
      <summary className="text-muted-foreground hover:text-foreground min-h-11 cursor-pointer py-2">
        Meu nome está errado
      </summary>
      {estado.tipo === 'enviado' ? (
        <p aria-live="polite" className="text-success mt-2" role="status">
          {ENVIADO}
        </p>
      ) : (
        <form
          className="mt-2 flex flex-col gap-3"
          onSubmit={(evento) => void enviar(evento)}
        >
          {campo('requested_name', 'Como o nome deve sair no certificado', {
            autoComplete: 'name',
            defaultValue: nomeAtual,
            required: true,
          })}
          {campo('contact', 'E-mail ou telefone para a resposta', { required: true })}
          {campo('message', 'Mensagem (opcional)')}
          <p aria-live="polite" className="text-destructive" role="status">
            {estado.tipo === 'erro' ? estado.mensagem : ''}
          </p>
          <button
            className="border-border hover:border-primary-muted min-h-11 w-fit rounded-full border px-5 font-medium"
            disabled={estado.tipo === 'enviando'}
            type="submit"
          >
            {estado.tipo === 'enviando' ? 'Enviando...' : 'Enviar o pedido'}
          </button>
        </form>
      )}
    </details>
  )
}
