'use server'

import { and, count, eq, max, ne } from 'drizzle-orm'

import {
  certificateTemplates,
  certificates,
  events,
  participationTypes,
} from '@/db/schema'
import { tipoDeParticipacaoSchema } from '@/lib/schemas/participation-type'
import { z } from '@/lib/zod'

import { defineAction, FalhaDaAction } from './define-action'

/**
 * Tipos de participação (doc 07). Não derrubam cache nenhum: a área pública
 * ainda não mostra os tipos.
 */

export const upsertParticipationType = defineAction({
  nome: 'participation_type.upsert',
  entidade: 'participation_types',
  papelMinimo: 'editor',
  schema: tipoDeParticipacaoSchema,
  async executar({ entrada, tx }) {
    const [evento] = await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, entrada.eventId))
    if (!evento) throw new FalhaDaAction('not_found', 'Não encontramos esse evento.')

    const mesmoSlug = and(
      eq(participationTypes.eventId, entrada.eventId),
      eq(participationTypes.slug, entrada.slug),
    )
    const [repetido] = await tx
      .select({ id: participationTypes.id })
      .from(participationTypes)
      .where(
        entrada.id ? and(mesmoSlug, ne(participationTypes.id, entrada.id)) : mesmoSlug,
      )
    if (repetido) {
      throw new FalhaDaAction(
        'conflict',
        'Este evento já tem um tipo com esse identificador.',
        {
          slug: ['Este evento já tem um tipo com esse identificador.'],
        },
      )
    }

    // O banco também recusa (FK composta com o evento); aqui a recusa vira
    // mensagem no campo, e não erro genérico.
    if (entrada.certificateTemplateId) {
      const [modelo] = await tx
        .select({ id: certificateTemplates.id })
        .from(certificateTemplates)
        .where(
          and(
            eq(certificateTemplates.id, entrada.certificateTemplateId),
            eq(certificateTemplates.eventId, entrada.eventId),
          ),
        )
      if (!modelo) {
        throw new FalhaDaAction('validation_error', 'Confira os campos destacados.', {
          certificateTemplateId: ['Esse modelo não é deste evento.'],
        })
      }
    }

    const valores = {
      slug: entrada.slug,
      label: entrada.label,
      aliases: entrada.aliases,
      defaultHours: entrada.defaultHours.toFixed(1),
      // Só muda quando vier: o formulário de tipos não mexe no modelo (M6).
      ...(entrada.certificateTemplateId !== undefined
        ? { certificateTemplateId: entrada.certificateTemplateId }
        : {}),
    }

    if (entrada.id) {
      const [antes] = await tx
        .select()
        .from(participationTypes)
        .where(
          and(
            eq(participationTypes.id, entrada.id),
            eq(participationTypes.eventId, entrada.eventId),
          ),
        )
        .for('update')
      if (!antes) throw new FalhaDaAction('not_found', 'Não encontramos esse tipo.')

      await tx
        .update(participationTypes)
        .set(valores)
        .where(eq(participationTypes.id, entrada.id))

      return {
        data: { id: entrada.id },
        entityId: entrada.id,
        diff: {
          antes: {
            slug: antes.slug,
            label: antes.label,
            defaultHours: antes.defaultHours,
          },
          depois: {
            slug: valores.slug,
            label: valores.label,
            defaultHours: valores.defaultHours,
          },
        },
      }
    }

    const [ultimo] = await tx
      .select({ ordem: max(participationTypes.sortOrder) })
      .from(participationTypes)
      .where(eq(participationTypes.eventId, entrada.eventId))

    const [criado] = await tx
      .insert(participationTypes)
      .values({
        ...valores,
        eventId: entrada.eventId,
        sortOrder: (ultimo?.ordem ?? 0) + 1,
      })
      .returning({ id: participationTypes.id })
    if (!criado) throw new Error('O insert do tipo não devolveu a linha.')

    return {
      data: { id: criado.id },
      entityId: criado.id,
      diff: {
        slug: valores.slug,
        label: valores.label,
        defaultHours: valores.defaultHours,
      },
    }
  },
})

export const deleteParticipationType = defineAction({
  nome: 'participation_type.delete',
  entidade: 'participation_types',
  papelMinimo: 'editor',
  schema: z.object({ id: z.uuid() }),
  async executar({ entrada, tx }) {
    const [tipo] = await tx
      .select()
      .from(participationTypes)
      .where(eq(participationTypes.id, entrada.id))
      .for('update')
    if (!tipo) throw new FalhaDaAction('not_found', 'Não encontramos esse tipo.')

    const [emitidos] = await tx
      .select({ total: count() })
      .from(certificates)
      .where(eq(certificates.participationTypeId, entrada.id))
    const total = emitidos?.total ?? 0
    if (total > 0) {
      throw new FalhaDaAction(
        'conflict',
        `Este tipo tem ${total} ${total === 1 ? 'certificado' : 'certificados'}. Remova-os antes de apagar o tipo.`,
      )
    }

    await tx.delete(participationTypes).where(eq(participationTypes.id, entrada.id))

    return {
      data: null,
      entityId: entrada.id,
      diff: { eventId: tipo.eventId, slug: tipo.slug, label: tipo.label },
    }
  },
})
