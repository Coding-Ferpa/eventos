import type { StatusDoEvento } from '@/lib/schemas/event'

/**
 * Os status como o admin os lê (doc 03, 6a). Só um difere da área pública:
 * "Realizado", que lá aparece como "Certificados em preparo".
 */
export const ROTULO_DO_STATUS_NO_ADMIN: Record<StatusDoEvento, string> = {
  draft: 'Rascunho',
  registration_open: 'Inscrições abertas',
  registration_closed: 'Inscrições encerradas',
  in_progress: 'Acontecendo agora',
  completed: 'Realizado',
  certificates_available: 'Certificados disponíveis',
  archived: 'Arquivado',
}
