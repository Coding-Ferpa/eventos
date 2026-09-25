import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { serverEnv, supabaseEnv } from '@/lib/env'

/**
 * Cliente do Supabase com a chave de serviço: ignora a RLS. Serve ao Storage
 * (URL assinada de upload, leitura do que foi enviado) e só é chamado dentro
 * de uma action que já conferiu sessão e papel (doc 08).
 */
export function supabaseAdmin() {
  return createClient(
    supabaseEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
