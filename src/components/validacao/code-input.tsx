'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'

import { canonicalizeCode, diagnoseCode, formatCode } from '@/features/certificate/code'

/**
 * Campo do código de validação (doc 03, 6e). Maiúsculas e hífens aparecem
 * enquanto a pessoa digita; o envio normaliza no navegador e navega para a
 * página do código (doc 07), que é quem consulta o banco.
 */

function mensagemDeErro(entrada: string): string | null {
  const diagnostico = diagnoseCode(entrada)
  if (diagnostico.ok) return null

  switch (diagnostico.reason) {
    case 'symbol':
      return /[A-Z]/.test(diagnostico.symbol)
        ? `A letra ${diagnostico.symbol} não existe nos nossos códigos. Confira a digitação.`
        : `O caractere ${diagnostico.symbol} não existe nos nossos códigos. Confira a digitação.`
    case 'short':
      return `O código tem 10 caracteres. ${diagnostico.missing === 1 ? 'Falta 1' : `Faltam ${diagnostico.missing}`}.`
    case 'long':
      return `O código tem 10 caracteres. ${diagnostico.extra === 1 ? 'Sobra 1' : `Sobram ${diagnostico.extra}`}.`
  }
}

export function CodeInput({ classeDaFonte }: { classeDaFonte?: string }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const idDoCampo = useId()
  const idDaAjuda = useId()
  const idDoErro = useId()

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const valor = String(new FormData(evento.currentTarget).get('codigo') ?? '')
    const problema = mensagemDeErro(valor)
    if (problema) {
      setErro(problema)
      return
    }

    const diagnostico = diagnoseCode(valor)
    if (diagnostico.ok) router.push(`/validar/${diagnostico.code}`)
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={enviar}>
      <div className="flex flex-col gap-2">
        <label className="font-semibold" htmlFor={idDoCampo}>
          Código de validação
        </label>
        <input
          aria-describedby={erro ? `${idDaAjuda} ${idDoErro}` : idDaAjuda}
          aria-invalid={erro ? true : undefined}
          autoCapitalize="characters"
          autoComplete="off"
          // Junção simples, sem `cn`: o `tailwind-merge` custaria 9 KB no
          // navegador, e estas classes não conflitam entre si.
          className={[
            'bg-card border-border focus:border-primary text-h3 min-h-14 rounded-md border px-4 font-mono tracking-wider',
            classeDaFonte,
          ]
            .filter(Boolean)
            .join(' ')}
          id={idDoCampo}
          inputMode="text"
          name="codigo"
          // Não controlado de propósito: o valor mora no DOM. Num celular
          // lento, quem digita antes da hidratação não perde o que digitou,
          // o que um `value` controlado pelo React apagaria ao assumir.
          onChange={(evento) => {
            const campo = evento.currentTarget
            campo.value = formatCode(canonicalizeCode(campo.value))
            setErro(null)
          }}
          placeholder="XXXX-XXX-XXX"
          spellCheck={false}
          type="text"
        />
        <p className="text-caption text-muted-foreground" id={idDaAjuda}>
          São 10 caracteres, como em 7K2M-9QF-4TX. Não precisa digitar os hífens.
        </p>
        {erro ? (
          <p className="text-caption text-destructive" id={idDoErro} role="alert">
            {erro}
          </p>
        ) : null}
      </div>

      <button
        className="bg-primary-solid text-primary-foreground min-h-12 w-fit rounded-full px-8 font-semibold transition duration-150"
        type="submit"
      >
        Validar
      </button>
    </form>
  )
}
