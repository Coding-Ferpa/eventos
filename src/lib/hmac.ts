import { createHmac } from 'node:crypto'

/**
 * HMAC que gira à meia-noite UTC (doc 08): `device_hash` e `ip_hash`. Serve
 * para limitar e para ligar eventos do mesmo dia, como a visita ao download,
 * e não para seguir alguém por semanas. O valor original nunca é persistido.
 *
 * O HMAC do CPF, que não gira, chega no M8.
 */
export function hashDiario(
  segredo: string,
  valor: string,
  agora: Date = new Date(),
): string {
  const dia = agora.toISOString().slice(0, 10)
  return createHmac('sha256', segredo).update(`${valor}|${dia}`).digest('base64url')
}
