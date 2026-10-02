import { createHmac } from 'node:crypto'

/**
 * HMAC que gira à meia-noite UTC (doc 08): `device_hash` e `ip_hash`. Serve
 * para limitar e para ligar eventos do mesmo dia, como a visita ao download,
 * e não para seguir alguém por semanas. O valor original nunca é persistido.
 */
export function hashDiario(
  segredo: string,
  valor: string,
  agora: Date = new Date(),
): string {
  const dia = agora.toISOString().slice(0, 10)
  return createHmac('sha256', segredo).update(`${valor}|${dia}`).digest('base64url')
}

/**
 * `cpf_hash` (ADR-0005): HMAC-SHA256 com o pepper do env como chave, sobre
 * `sal_do_evento:cpf`. A chave é o texto do env como está, sem decodificar o
 * base64, igual ao `hashDiario`. O pepper nunca muda, então esta escolha
 * também não: o teste a fixa com um vetor do openssl.
 */
export function hmacCpf(pepper: string, salDoEvento: string, cpf: string): string {
  if (!/^\d{11}$/.test(cpf))
    throw new Error('hmacCpf recebe o CPF em 11 dígitos, sem máscara.')
  return createHmac('sha256', pepper).update(`${salDoEvento}:${cpf}`).digest('hex')
}
