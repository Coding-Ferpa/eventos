'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from '@/lib/zod'

import { actionError, type ActionResult } from '@/actions/result'
import { isGithubOAuthEnabled } from '@/lib/env'
import { safeRedirectPath } from '@/lib/redirect'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Autenticação (doc 08). São as únicas actions sem checagem de sessão, porque
 * é isso que elas criam. Toda entrada passa por Zod e nada aqui decide
 * autorização: quem decide é o papel que o Auth Hook põe no JWT, lido pelo
 * guarda do admin e pelo `defineAction`.
 */

const DESTINO_PADRAO = '/admin'

const credenciaisSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  senha: z.string().min(6, 'A senha precisa de pelo menos 6 caracteres.'),
  intencao: z.enum(['entrar', 'cadastrar']).default('entrar'),
  proximo: z.string().optional(),
})

export async function autenticar(
  _estadoAnterior: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const entrada = credenciaisSchema.safeParse({
    email: formData.get('email'),
    senha: formData.get('senha'),
    intencao: formData.get('intencao') ?? 'entrar',
    proximo: formData.get('proximo') ?? undefined,
  })

  if (!entrada.success) {
    return actionError(
      'validation_error',
      'Confira os campos destacados.',
      z.flattenError(entrada.error).fieldErrors,
    )
  }

  const { email, senha, intencao, proximo } = entrada.data
  const supabase = await createSupabaseServerClient()

  if (intencao === 'cadastrar') {
    const { error } = await supabase.auth.signUp({ email, password: senha })

    if (error) {
      return actionError(
        'unauthorized',
        'Não conseguimos criar sua conta. Tente de novo em instantes.',
      )
    }

    // Conta nova não tem perfil no Eventos e não acessa o admin: quem cria o
    // perfil, com o papel, é um admin do Eventos (ADR-0018).
    redirect('/')
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error) {
    // Mensagem única de propósito: dizer se o e-mail existe entregaria a lista
    // de contas para quem estiver testando endereços.
    return actionError('unauthorized', 'E-mail ou senha incorretos.')
  }

  redirect(safeRedirectPath(proximo, DESTINO_PADRAO))
}

/**
 * Sem retorno tipado porque o formulário do GitHub não tem estado no cliente:
 * ou a pessoa sai daqui para o GitHub, ou volta ao login com aviso.
 */
export async function entrarComGithub(): Promise<void> {
  // A action é um endpoint público: esconder o botão não basta, ela também
  // precisa recusar quando o provider não está configurado.
  if (!isGithubOAuthEnabled()) {
    redirect('/login?erro=oauth')
  }

  const supabase = await createSupabaseServerClient()
  const origem = (await headers()).get('origin')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: `${origem}/auth/callback` },
  })

  if (error || !data.url) {
    redirect('/login?erro=oauth')
  }

  redirect(data.url)
}

export async function sair(): Promise<never> {
  const supabase = await createSupabaseServerClient()

  // `local` e não o escopo padrão `global`: sair aqui encerra esta sessão, não
  // todas as da pessoa. Com o padrão, sair no computador da organização
  // derrubava junto o celular, e nos testes em paralelo derrubava as outras
  // sessões do mesmo usuário no meio do caminho (lição do CF Jobs).
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/')
}
