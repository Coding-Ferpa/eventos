'use client'

import { useId, useState } from 'react'

/**
 * "Meu nome está errado" (docs 03 e 07): formulário inline, sem modal, porque
 * teclado virtual e modal não convivem. O pedido é gravado na plataforma,
 * nunca por `mailto:` nem WhatsApp, para não sair da fila e do histórico. É
 * um por pessoa: o nome é dela, e não de cada certificado.
 */

type Estado =
  | { tipo: 'fechado' }
  | { tipo: 'aberto' }
  | { tipo: 'enviando' }
  | { tipo: 'enviado' }
  | { tipo: 'erro'; mensagem: string; campos: Record<string, string[]> }

const ENVIADO =
  'Pedido enviado. A organização vai revisar, e o certificado corrigido mantém o mesmo código. Não precisa pedir de novo.'

export function PedidoDeCorrecao({
  code,
  nomeAtual,
  pendente,
}: {
  code: string
  nomeAtual: string
  pendente: boolean
}) {
  const id = useId()
  const [estado, setEstado] = useState<Estado>({ tipo: 'fechado' })

  if (pendente)
    return <p className="text-muted-foreground">Pedido de correção em análise</p>
  if (estado.tipo === 'enviado') {
    return (
      <p className="border-success shadow-glow rounded-md border px-4 py-3" role="status">
        {ENVIADO}
      </p>
    )
  }

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

  const aberto = estado.tipo !== 'fechado'
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
        className="bg-surface min-h-12 rounded-sm border px-3"
        id={`${id}-${nome}`}
        name={nome}
        readOnly={estado.tipo === 'enviando'}
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
    <div className="flex flex-col gap-3">
      <button
        aria-controls={`${id}-formulario`}
        aria-expanded={aberto}
        className="border-border hover:border-primary min-h-11 w-fit rounded-full border px-5 font-medium"
        onClick={() => setEstado(aberto ? { tipo: 'fechado' } : { tipo: 'aberto' })}
        type="button"
      >
        Meu nome está errado
      </button>
      <form
        className="flex flex-col gap-3"
        hidden={!aberto}
        id={`${id}-formulario`}
        onSubmit={(evento) => void enviar(evento)}
      >
        {campo('requested_name', 'Nome correto', {
          autoComplete: 'name',
          defaultValue: nomeAtual,
          maxLength: 120,
          minLength: 3,
          required: true,
        })}
        {campo('contact', 'E-mail ou WhatsApp para contato', {
          maxLength: 120,
          required: true,
        })}
        <p aria-live="polite" className="text-destructive">
          {estado.tipo === 'erro' ? estado.mensagem : ''}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            aria-busy={estado.tipo === 'enviando'}
            className="bg-primary-solid text-primary-foreground min-h-11 rounded-full px-5 font-semibold"
            disabled={estado.tipo === 'enviando'}
            type="submit"
          >
            {estado.tipo === 'enviando' ? 'Enviando...' : 'Enviar pedido de correção'}
          </button>
          <button
            className="text-muted-foreground min-h-11 px-3"
            onClick={() => setEstado({ tipo: 'fechado' })}
            type="button"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
