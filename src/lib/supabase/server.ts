import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { clientEnv } from '@/lib/env'

/**
 * Cliente do Supabase para Server Components, Server Actions e Route Handlers.
 * A sessão vive em cookies httpOnly gerenciados pelo `@supabase/ssr` (doc 08),
 * e nunca em localStorage.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const env = clientEnv()

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Component não pode escrever cookie. Tudo bem: o proxy
            // já renovou a sessão nesta mesma requisição.
          }
        },
      },
    },
  )
}
