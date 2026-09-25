import type { Metadata } from 'next'
import Link from 'next/link'

import { entrarComGithub } from '@/actions/auth'
import { LoginForm } from '@/components/auth/login-form'
import { isGithubOAuthEnabled } from '@/lib/env'
import { safeRedirectPath } from '@/lib/redirect'

export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false, follow: false },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ proximo?: string; erro?: string }>
}) {
  const { proximo, erro } = await searchParams
  const destino = safeRedirectPath(proximo, '/admin')
  const githubDisponivel = isGithubOAuthEnabled()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-h2 font-bold">Entrar</h1>
        <p className="text-muted-foreground">
          Acesso à organização dos eventos da comunidade Coding Ferpa.
        </p>
      </header>

      {erro === 'oauth' ? (
        <p
          className="border-destructive text-caption text-destructive rounded-md border px-4 py-3"
          role="alert"
        >
          Não conseguimos concluir a entrada com o GitHub. Tente de novo ou use e-mail e
          senha.
        </p>
      ) : null}

      <LoginForm proximo={destino} />

      {/* Sem credenciais de OAuth configuradas o botão não aparece: melhor que
          um botão que leva a uma tela de erro. As credenciais entram no M9. */}
      {githubDisponivel ? (
        <>
          <p className="text-caption text-muted-foreground text-center">ou</p>
          <form action={entrarComGithub}>
            <button
              className="border-border hover:border-primary-muted w-full rounded-full border px-6 py-2.5 font-semibold transition duration-150"
              type="submit"
            >
              Entrar com GitHub
            </button>
          </form>
        </>
      ) : null}

      <p className="text-caption text-muted-foreground">
        Contas novas entram sem acesso: quem organiza os eventos libera o seu.{' '}
        <Link className="text-foreground decoration-primary underline" href="/">
          Voltar para os eventos
        </Link>
      </p>
    </main>
  )
}
