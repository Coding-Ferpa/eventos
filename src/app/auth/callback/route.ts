import { NextResponse, type NextRequest } from 'next/server'

import { safeRedirectPath } from '@/lib/redirect'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Retorno do OAuth: troca o `code` por uma sessão em cookie e devolve a pessoa
 * ao destino pedido. Qualquer falha volta para o login com aviso, e nunca para
 * uma tela de erro crua.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const destino = safeRedirectPath(searchParams.get('proximo'), '/admin')

  if (!code) {
    return NextResponse.redirect(`${origin}/login?erro=oauth`)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?erro=oauth`)
  }

  return NextResponse.redirect(`${origin}${destino}`)
}
