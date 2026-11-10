import { pgSchema } from 'drizzle-orm/pg-core'

/**
 * O schema do Eventos no projeto Supabase que ele divide com o CF Jobs
 * (ADR-0018). Toda tabela, enum e view daqui nasce nele, e nada no `public`.
 * Fica fora do `index.ts` de propósito: é o contêiner, e não uma entidade.
 */
export const eventos = pgSchema('eventos')
