import { COOKIE_DE_DISPOSITIVO, lerCookieDeDispositivo } from '@/lib/cookies/device'
import { hashDiario } from '@/lib/hmac'

/**
 * Quem está pedindo, sem guardar quem é (doc 08): o IP e o id do cookie de
 * dispositivo viram HMACs que giram à meia-noite UTC. O IP vem do primeiro
 * endereço do `x-forwarded-for`, que na Vercel é confiável.
 *
 * Sem cookie de dispositivo válido (curl, cookies bloqueados, assinatura
 * forjada), a chave de dispositivo é `nocookie:{ip_hash}`: os limites
 * estreitos do PRD, compartilhados pelo IP. Navegador honesto nunca chega
 * aqui, porque passou por uma página antes e o proxy emitiu o cookie.
 */
export type Requisitante = {
  ipHash: string
  /** O que vai para os logs e para a chave do balde de dispositivo. */
  deviceHash: string
}

export function requisitante(
  request: Pick<Request, 'headers'> & {
    cookies: { get(nome: string): { value: string } | undefined }
  },
  segredos: { DEVICE_COOKIE_SECRET: string; IP_HASH_SECRET: string },
  agora: Date = new Date(),
): Requisitante {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'desconhecido'
  const ipHash = hashDiario(segredos.IP_HASH_SECRET, ip, agora)
  const id = lerCookieDeDispositivo(
    request.cookies.get(COOKIE_DE_DISPOSITIVO)?.value,
    segredos.DEVICE_COOKIE_SECRET,
    agora,
  )
  return {
    ipHash,
    deviceHash: id
      ? hashDiario(segredos.IP_HASH_SECRET, id, agora)
      : `nocookie:${ipHash}`,
  }
}
