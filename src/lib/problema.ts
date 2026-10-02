import { siteEnv } from '@/lib/env'

/**
 * Erros das rotas públicas em RFC 9457 (doc 07): `code` estável para a tela
 * mapear e `detail` em pt-BR pronto para exibir. Tudo `no-store`: nenhuma
 * resposta sobre pessoa pode parar num cache.
 */

export type CodigoPublico =
  | 'not_found'
  | 'validation_error'
  | 'rate_limited'
  | 'event_unavailable'
  | 'forbidden'
  | 'correction_already_pending'
  | 'unauthorized'

export const SEM_CACHE = { 'Cache-Control': 'no-store' } as const

export function problema(
  status: number,
  code: CodigoPublico,
  detail: string,
  extras: {
    fieldErrors?: Record<string, string[]>
    headers?: Record<string, string>
  } = {},
): Response {
  return Response.json(
    {
      type: 'about:blank',
      status,
      code,
      detail,
      ...(extras.fieldErrors ? { field_errors: extras.fieldErrors } : {}),
    },
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json',
        ...SEM_CACHE,
        ...extras.headers,
      },
    },
  )
}

/**
 * `POST` público só de páginas do próprio site (doc 07). O cookie de
 * dispositivo é `SameSite=Lax` e já não viaja de outro site, mas a busca
 * também aceita quem chega sem ele, e é aqui que esse caminho fecha.
 */
export function origemDoSite(request: Pick<Request, 'headers'>): boolean {
  return request.headers.get('origin') === new URL(siteEnv().NEXT_PUBLIC_SITE_URL).origin
}
