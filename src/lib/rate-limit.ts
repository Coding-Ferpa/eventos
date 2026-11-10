import 'server-only'

import { sql } from 'drizzle-orm'

import type { Database, Transaction } from '@/db/client'

/**
 * Os baldes do doc 08 sobre a `check_rate_limit` (ADR-0006). A função SQL
 * conhece uma janela por chamada; cada janela vira uma chave própria, e todas
 * contam a mesma tentativa. É daí que vem o backoff progressivo: estourar o
 * minuto custa até 60 s, insistir estoura a hora, insistir mais estoura o dia.
 */

export type Janela = { maximo: number; segundos: number }
export type Veredito = { permitido: true } | { permitido: false; esperarSegundos: number }

const MINUTO = 60
const HORA = 60 * MINUTO
const DIA = 24 * HORA

export const LIMITES = {
  /** Os números do PRD, por pessoa: a 6ª tentativa no mesmo minuto recebe 429. */
  buscaPorDispositivo: [
    { maximo: 5, segundos: MINUTO },
    { maximo: 20, segundos: HORA },
    { maximo: 60, segundos: DIA },
  ],
  /** Só falhas, largo: o auditório inteiro sai pelo mesmo IP. */
  buscaPorIp: [
    { maximo: 20, segundos: MINUTO },
    { maximo: 150, segundos: HORA },
    { maximo: 600, segundos: DIA },
  ],
  downloadPorDispositivo: [{ maximo: 10, segundos: MINUTO }],
  downloadPorIp: [{ maximo: 120, segundos: MINUTO }],
  validacaoPorIp: [
    { maximo: 30, segundos: MINUTO },
    { maximo: 300, segundos: HORA },
  ],
  correcaoPorCertificado: [{ maximo: 3, segundos: DIA }],
  correcaoPorDispositivo: [{ maximo: 5, segundos: DIA }],
} as const satisfies Record<string, readonly Janela[]>

type Executor = Pick<Database | Transaction, 'execute'>

async function perguntar(
  executor: Executor,
  chave: string,
  janelas: readonly Janela[],
  incremento: 0 | 1,
): Promise<Veredito> {
  let esperar = 0
  for (const janela of janelas) {
    const [linha] = await executor.execute<{ allowed: boolean; esperar: number }>(sql`
      select allowed, ceil(extract(epoch from reset_at - clock_timestamp()))::int as esperar
        from eventos.check_rate_limit(
          ${`${chave}:${janela.segundos}`}, ${janela.maximo},
          make_interval(secs => ${janela.segundos}), ${incremento})`)
    // A maior janela estourada manda no Retry-After (doc 08).
    if (!linha?.allowed) esperar = Math.max(esperar, linha?.esperar ?? janela.segundos, 1)
  }
  return esperar > 0
    ? { permitido: false, esperarSegundos: esperar }
    : { permitido: true }
}

/** "Cabe mais uma?": olha sem gastar. É o balde de IP antes da busca. */
export function consultarBalde(
  executor: Executor,
  chave: string,
  janelas: readonly Janela[],
) {
  return perguntar(executor, chave, janelas, 0)
}

/** "Esta coube?": gasta uma em cada janela. */
export function consumirBalde(
  executor: Executor,
  chave: string,
  janelas: readonly Janela[],
) {
  return perguntar(executor, chave, janelas, 1)
}
