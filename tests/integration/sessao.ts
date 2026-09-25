import { createServerClient } from '@supabase/ssr'

/**
 * Sessão real por papel, para os testes de integração das Server Actions.
 * Herdada do CF Jobs.
 *
 * Nada de token forjado: o login acontece pelo GoTrue local, com a mesma senha
 * que uma pessoa digitaria, e os cookies que saem daqui são os que o
 * `@supabase/ssr` escreveria no navegador. Assim o teste exercita o caminho
 * inteiro, inclusive o Custom Access Token Hook que injeta `user_role`, que é
 * justamente o que decide a autorização.
 *
 * As contas vêm do `supabase/seeds/02-dev.sql` e só existem em local e no CI.
 */

export type Papel = 'admin' | 'editor' | 'reader'

export const SENHA_DE_SEED = 'cfeventos-local'

export type Cookie = { name: string; value: string }

/** Reproduz o mínimo do `cookies()` do Next que o cliente do Supabase usa. */
export class CookiesFalsos {
  constructor(private itens: Cookie[] = []) {}

  getAll(): Cookie[] {
    return this.itens
  }

  get(name: string): Cookie | undefined {
    return this.itens.find((cookie) => cookie.name === name)
  }

  set(name: string, value: string): void {
    const existente = this.itens.findIndex((cookie) => cookie.name === name)
    if (existente >= 0) this.itens[existente] = { name, value }
    else this.itens.push({ name, value })
  }
}

export async function abrirSessao(papel: Papel): Promise<CookiesFalsos> {
  const cookies = new CookiesFalsos()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookies.getAll(),
        setAll: (novos) => {
          for (const { name, value } of novos) cookies.set(name, value)
        },
      },
    },
  )

  const { error } = await supabase.auth.signInWithPassword({
    email: `${papel}@cfeventos.local`,
    password: SENHA_DE_SEED,
  })

  if (error) {
    throw new Error(
      `Login de ${papel}@cfeventos.local falhou: ${error.message}. ` +
        'Rode `pnpm db:reset`: as contas por papel vêm do seed local.',
    )
  }

  return cookies
}
