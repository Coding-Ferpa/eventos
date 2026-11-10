import 'server-only'

import { sql } from 'drizzle-orm'

import { db } from '@/db/client'

/**
 * Registra a visita do dispositivo ao evento, no máximo uma por dia (doc 10).
 * O dia é o UTC, o mesmo em que o `device_hash` gira, para a visita e o
 * download do mesmo dia se encontrarem na métrica.
 *
 * Vai pela conexão privilegiada: `anon` não escreve em tabela nenhuma
 * (ADR-0012), e o dispositivo já foi conferido pelo HMAC do cookie. Evento em
 * rascunho ou inexistente não grava nada.
 */
export async function registrarVisita(slug: string, deviceHash: string): Promise<void> {
  await db().execute(sql`
    insert into eventos.event_visits (event_id, device_hash, day)
    select id, ${deviceHash}, (now() at time zone 'utc')::date
    from eventos.events
    where slug = ${slug} and status <> 'draft'
    on conflict do nothing
  `)
}
