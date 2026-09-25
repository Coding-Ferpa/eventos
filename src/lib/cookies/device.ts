import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Cookie de dispositivo (doc 08, ADR-0006): identifica o navegador para o
 * balde de rate limit por dispositivo e para ligar a visita ao download. É
 * emitido pelo proxy na primeira página pública, e não na primeira busca: se
 * nascesse com a busca, a primeira tentativa de todo mundo cairia no balde de
 * IP, justo no pico do evento, com o auditório inteiro no mesmo IP.
 *
 * `v1.{id}.{emitido_em}.{HMAC}`: o id são 128 bits aleatórios, `emitido_em` é
 * em segundos, e o HMAC com `DEVICE_COOKIE_SECRET` impede forjar um id.
 */

export const COOKIE_DE_DISPOSITIVO = 'cf-dispositivo'

const TRINTA_DIAS_S = 30 * 24 * 60 * 60
// Relógio de servidor adiantado alguns minutos não pode invalidar cookie novo.
const FOLGA_DE_RELOGIO_S = 5 * 60

export const OPCOES_DO_COOKIE_DE_DISPOSITIVO = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: TRINTA_DIAS_S,
  path: '/',
} as const

const ID = /^[A-Za-z0-9_-]{22}$/
const SEGUNDOS = /^\d+$/

function assinar(segredo: string, conteudo: string): string {
  return createHmac('sha256', segredo).update(conteudo).digest('base64url')
}

export function criarCookieDeDispositivo(
  segredo: string,
  agora: Date = new Date(),
): string {
  const id = randomBytes(16).toString('base64url')
  const emitidoEm = Math.floor(agora.getTime() / 1000)
  const conteudo = `v1.${id}.${emitidoEm}`

  return `${conteudo}.${assinar(segredo, conteudo)}`
}

/** O id do dispositivo, ou `null` quando o cookie falta, é forjado ou venceu. */
export function lerCookieDeDispositivo(
  valor: string | undefined,
  segredo: string,
  agora: Date = new Date(),
): string | null {
  const partes = valor?.split('.') ?? []
  if (partes.length !== 4) return null

  const [versao, id, emitidoEm, assinatura] = partes as [string, string, string, string]
  if (versao !== 'v1' || !ID.test(id) || !SEGUNDOS.test(emitidoEm)) return null

  const esperada = Buffer.from(assinar(segredo, `v1.${id}.${emitidoEm}`))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) {
    return null
  }

  const idade = Math.floor(agora.getTime() / 1000) - Number(emitidoEm)
  if (idade < -FOLGA_DE_RELOGIO_S || idade > TRINTA_DIAS_S) return null

  return id
}
