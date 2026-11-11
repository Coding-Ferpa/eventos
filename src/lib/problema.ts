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
 *
 * Vale o endereço oficial e também o endereço por onde o pedido chegou (o
 * `*.vercel.app` do projeto serve o mesmo site): é o critério do Next nas
 * Server Actions. Outro site nunca passa, porque a origem dele não é o host
 * do pedido; e cada subdomínio do `vercel.app` é um site à parte.
 */
export function origemPermitida(
  origem: string | null,
  siteUrl: string,
  hostDoPedido: string | null,
): boolean {
  if (!origem) return false
  let url: URL
  try {
    url = new URL(origem)
  } catch {
    return false
  }
  if (url.origin === new URL(siteUrl).origin) return true
  return hostDoPedido !== null && url.host === hostDoPedido.trim().toLowerCase()
}

export function origemDoSite(request: Pick<Request, 'headers'>): boolean {
  // Na Vercel, o host que a pessoa abriu chega em `x-forwarded-host`.
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0] ?? request.headers.get('host')
  return origemPermitida(
    request.headers.get('origin'),
    siteEnv().NEXT_PUBLIC_SITE_URL,
    host ?? null,
  )
}
