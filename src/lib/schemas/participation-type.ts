import { SLUG } from '@/lib/slug'
import { z } from '@/lib/zod'

/**
 * Tipo de participação (doc 04): o formulário e a action `upsertParticipationType`
 * usam o mesmo schema.
 *
 * Os apelidos são os valores que a coluna de tipo do CSV pode trazer
 * ("ouvinte" para participante). No formulário eles vêm num campo de texto,
 * separados por vírgula.
 */
const apelidos = z.preprocess(
  (valor) =>
    typeof valor === 'string'
      ? [
          ...new Set(
            valor
              .split(/[,;]/)
              .map((apelido) => apelido.trim().toLowerCase())
              .filter(Boolean),
          ),
        ]
      : valor,
  z
    .array(z.string().max(40, 'Cada apelido pode ter até 40 caracteres.'))
    .max(20, 'Até 20 apelidos.'),
)

export const tipoDeParticipacaoSchema = z.object({
  id: z.uuid().optional(),
  eventId: z.uuid(),
  slug: z
    .string()
    .trim()
    .min(2, 'O identificador precisa de pelo menos 2 caracteres.')
    .max(40, 'O identificador pode ter até 40 caracteres.')
    .regex(SLUG, 'Use só letras minúsculas, números e hífens, como palestrante.'),
  label: z
    .string()
    .trim()
    .min(2, 'O nome precisa de pelo menos 2 caracteres.')
    .max(60, 'O nome pode ter até 60 caracteres.'),
  aliases: apelidos,
  // numeric(5,1) no banco: até 9.999,9 horas, com uma casa decimal.
  defaultHours: z.coerce
    .number('Informe a carga horária em horas.')
    .min(0, 'A carga horária não pode ser negativa.')
    .max(9999.9, 'A carga horária pode ir até 9.999,9 horas.')
    .refine(
      (horas) => Math.abs(horas * 10 - Math.round(horas * 10)) < 1e-9,
      'Use no máximo uma casa decimal, como 1,5.',
    ),
  certificateTemplateId: z.uuid().nullable().optional(),
})

export type TipoDeParticipacao = z.input<typeof tipoDeParticipacaoSchema>
