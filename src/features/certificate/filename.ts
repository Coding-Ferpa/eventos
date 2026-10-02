/**
 * O nome do PDF baixado (doc 05): `certificado-{slug}-{primeiro-nome}.pdf`. O
 * `filename` em ASCII é o que todo navegador entende; o `filename*` em UTF-8
 * guarda o acento para quem lê.
 */
export function contentDisposition(slug: string, fullName: string): string {
  const primeiro = fullName.trim().split(/\s+/)[0] ?? ''
  const ascii = primeiro
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/^-+|-+$/g, '')
  const utf8 = primeiro.toLowerCase().replace(/[’'"]/g, '')
  const nome = (sufixo: string) => `certificado-${slug}${sufixo ? `-${sufixo}` : ''}.pdf`
  return `attachment; filename="${nome(ascii)}"; filename*=UTF-8''${encodeURIComponent(nome(utf8))}`
}
