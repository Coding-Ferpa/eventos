import { parseAsInteger, parseAsString } from 'nuqs/server'

/** Filtros da lista de participantes, na URL (doc 09). */
export const parametrosDosParticipantes = {
  lote: parseAsString,
  busca: parseAsString.withDefault(''),
  pagina: parseAsInteger.withDefault(1),
}
