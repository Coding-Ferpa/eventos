'use client'

import { useActionState } from 'react'

import { autenticar } from '@/actions/auth'
import type { ActionResult } from '@/actions/result'

export function LoginForm({ proximo }: { proximo: string }) {
  const [estado, formAction, pendente] = useActionState<ActionResult | null, FormData>(
    autenticar,
    null,
  )

  const erro = estado && !estado.ok ? estado.error : null
  const erroDeCampo = (campo: string) => erro?.fieldErrors?.[campo]?.[0]

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="proximo" value={proximo} />

      <div className="flex flex-col gap-1.5">
        <label className="text-caption font-medium" htmlFor="email">
          E-mail
        </label>
        <input
          aria-describedby={erroDeCampo('email') ? 'erro-email' : undefined}
          aria-invalid={erroDeCampo('email') ? true : undefined}
          autoComplete="email"
          className="border-border bg-surface rounded-sm border px-3 py-2"
          id="email"
          name="email"
          required
          type="email"
        />
        {erroDeCampo('email') ? (
          <p className="text-caption text-destructive" id="erro-email">
            {erroDeCampo('email')}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-caption font-medium" htmlFor="senha">
          Senha
        </label>
        <input
          aria-describedby={erroDeCampo('senha') ? 'erro-senha' : undefined}
          aria-invalid={erroDeCampo('senha') ? true : undefined}
          autoComplete="current-password"
          className="border-border bg-surface rounded-sm border px-3 py-2"
          id="senha"
          minLength={6}
          name="senha"
          required
          type="password"
        />
        {erroDeCampo('senha') ? (
          <p className="text-caption text-destructive" id="erro-senha">
            {erroDeCampo('senha')}
          </p>
        ) : null}
      </div>

      {/* aria-live para leitores de tela anunciarem a falha sem mudar o foco. */}
      <p aria-live="polite" className="text-caption text-destructive min-h-5">
        {erro && !erro.fieldErrors ? erro.message : null}
      </p>

      <button
        className="bg-primary-solid text-primary-foreground rounded-full px-6 py-2.5 font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={pendente}
        name="intencao"
        type="submit"
        value="entrar"
      >
        {pendente ? 'Entrando...' : 'Entrar'}
      </button>

      <button
        className="border-border hover:border-primary-muted rounded-full border px-6 py-2.5 font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={pendente}
        name="intencao"
        type="submit"
        value="cadastrar"
      >
        Criar conta
      </button>
    </form>
  )
}
