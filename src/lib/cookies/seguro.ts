const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Se o cookie leva `Secure`: sempre, menos em http no próprio localhost, como
 * no `pnpm start` das E2E. O WebKit guarda o cookie `Secure` que recebe por
 * http://localhost e nunca o devolve por http (medido no M8: a busca dava 200
 * e a tela de retirada voltava como sessão expirada); o Chromium trata
 * localhost como contexto seguro e devolve. Produção nunca é localhost, e
 * qualquer outro host, até em http, continua com `Secure`.
 */
export function cookieSeguro(url: string | URL): boolean {
  const { protocol, hostname } = new URL(url)
  return protocol === 'https:' || !HOSTS_LOCAIS.has(hostname)
}
