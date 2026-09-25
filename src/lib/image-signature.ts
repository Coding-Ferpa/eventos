/**
 * O tipo de uma imagem pelos primeiros bytes, e não pela extensão nem pelo
 * `Content-Type` que o navegador declarou (migration 0012): os dois são o que
 * quem envia diz, e os bytes são o que o arquivo é.
 */
export type TipoDeImagem = 'jpg' | 'png' | 'webp'

function comeca(bytes: Uint8Array, assinatura: number[], desde = 0): boolean {
  return assinatura.every((byte, i) => bytes[desde + i] === byte)
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG = [0xff, 0xd8, 0xff]
const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]

export function tipoDeImagemPelosBytes(bytes: Uint8Array): TipoDeImagem | null {
  if (comeca(bytes, JPEG)) return 'jpg'
  if (comeca(bytes, PNG)) return 'png'
  // RIFF, 4 bytes de tamanho, e o formato: só WEBP nos interessa.
  if (comeca(bytes, RIFF) && comeca(bytes, WEBP, 8)) return 'webp'
  return null
}
