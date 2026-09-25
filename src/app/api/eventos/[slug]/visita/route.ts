import type { NextRequest } from 'next/server'

import { registrarVisita } from '@/db/queries/visits'
import { semBanco } from '@/lib/ambiente'
import { COOKIE_DE_DISPOSITIVO, lerCookieDeDispositivo } from '@/lib/cookies/device'
import { serverEnv } from '@/lib/env'
import { hashDiario } from '@/lib/hmac'
import { logger } from '@/lib/logger'
import { z } from '@/lib/zod'

/**
 * Beacon de visita da página do evento (doc 07). Responde 204 sempre: quem
 * envia é o `sendBeacon`, que não lê resposta, e métrica nunca pode virar
 * erro na tela de ninguém.
 *
 * Sem cookie de dispositivo válido, não grava. O cookie é `SameSite=Lax`, e
 * por isso não viaja num POST disparado de outro site.
 */

const slugDeEvento = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)

function semConteudo() {
  return new Response(null, { status: 204 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (semBanco()) return semConteudo()

  const slug = slugDeEvento.safeParse((await params).slug)
  if (!slug.success) return semConteudo()

  const env = serverEnv()
  const id = lerCookieDeDispositivo(
    request.cookies.get(COOKIE_DE_DISPOSITIVO)?.value,
    env.DEVICE_COOKIE_SECRET,
  )
  if (!id) return semConteudo()

  try {
    await registrarVisita(slug.data, hashDiario(env.IP_HASH_SECRET, id))
  } catch {
    logger.warn({ event: 'visit.failed', route: '/api/eventos/[slug]/visita' })
  }

  return semConteudo()
}
