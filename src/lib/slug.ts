/**
 * Slug de evento (doc 02): `kebab-case` do título, sem acento, até 80
 * caracteres. É o endereço público do evento e, depois que ele sai do
 * rascunho, não muda mais: vai para cartaz, QR e link de grupo.
 */

/** A mesma regra do check da tabela `events` (doc 04). */
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const TAMANHO_MAXIMO = 80

export function gerarSlug(titulo: string): string {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira os acentos que o NFD separou
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, TAMANHO_MAXIMO)
    .replace(/-+$/, '')
}
