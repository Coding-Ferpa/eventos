/**
 * Os buckets do Storage do Eventos. O nome de bucket é único no projeto
 * Supabase, que o Eventos divide com o CF Jobs (ADR-0018), por isso todos
 * levam o prefixo `eventos-`. Os mesmos nomes estão na migration 0012 e no
 * `next.config.ts`, e o teste ao lado confere que os três batem.
 */
export const BUCKETS = {
  /** Capas de evento: públicas, servidas pela CDN do Storage. */
  capas: 'eventos-covers',
  /** Fundo da prévia, sem nenhum nome: público. */
  previas: 'eventos-previews',
  /** Arte original e `base.pdf`: privados. */
  modelos: 'eventos-templates',
  /** Fontes enviadas pelo admin: privadas. */
  fontes: 'eventos-fonts',
} as const

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS]
