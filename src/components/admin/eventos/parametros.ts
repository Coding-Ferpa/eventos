import { parseAsInteger, parseAsString, parseAsStringLiteral } from 'nuqs/server'

import { STATUS_DO_EVENTO } from '@/lib/schemas/event'

/**
 * Filtros e página da lista de eventos, na URL (doc 09): o mesmo parser serve
 * à página, no servidor, e aos filtros, no navegador. Link compartilhável e
 * botão voltar funcionando.
 */
export const parametrosDaLista = {
  status: parseAsStringLiteral(STATUS_DO_EVENTO),
  busca: parseAsString.withDefault(''),
  pagina: parseAsInteger.withDefault(1),
}
