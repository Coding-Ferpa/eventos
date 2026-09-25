import { supabaseEnv } from '@/lib/env'

/**
 * De onde vem a capa do evento. Sem capa enviada, a imagem é gerada a partir
 * do título (doc 09): nunca `src` vazio, nunca imagem quebrada.
 *
 * O bucket `covers` é público (doc 04), então a capa enviada é servida pela
 * URL pública do Storage, sem assinatura.
 */
export function srcDaCapa(evento: { slug: string; coverPath: string | null }): string {
  if (!evento.coverPath) return `/eventos/${evento.slug}/capa`

  const base = supabaseEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
  return `${base}/storage/v1/object/public/covers/${evento.coverPath}`
}
