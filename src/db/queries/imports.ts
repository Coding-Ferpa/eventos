import 'server-only'

import { and, desc, eq } from 'drizzle-orm'

import type { Transaction } from '@/db/client'
import {
  certificateTemplates,
  events,
  importBatches,
  participationTypes,
} from '@/db/schema'
import { dataFieldSchema, type DataField } from '@/features/certificate/schema'
import type { MappingContext } from '@/features/import/mapping'
import type { ImportType, ValidateContext } from '@/features/import/validate-row'
import { z } from '@/lib/zod'

/**
 * O que a importação precisa saber do evento (doc 06): a busca, o sal do CPF
 * e, por tipo, os campos do modelo e o preset de colunas. Os campos são os do
 * modelo como está agora, rascunho ou publicado: o admin edita o modelo e
 * importa em seguida, antes de publicar.
 */

export type ImportTypeContext = ImportType & {
  templateId: string | null
  columnMapping: Record<string, string>
}

export type ImportContext = {
  event: {
    id: string
    slug: string
    cpfSalt: string
    search: ValidateContext['search']
  }
  types: ImportTypeContext[]
}

const camposSchema = z.array(dataFieldSchema)

export async function loadImportContext(
  tx: Transaction,
  eventId: string,
): Promise<ImportContext | null> {
  const [evento] = await tx.select().from(events).where(eq(events.id, eventId))
  if (!evento) return null

  const tipos = await tx
    .select({
      id: participationTypes.id,
      slug: participationTypes.slug,
      label: participationTypes.label,
      aliases: participationTypes.aliases,
      templateId: certificateTemplates.id,
      dataFields: certificateTemplates.dataFields,
      columnMapping: certificateTemplates.columnMapping,
    })
    .from(participationTypes)
    .leftJoin(
      certificateTemplates,
      eq(certificateTemplates.id, participationTypes.certificateTemplateId),
    )
    .where(eq(participationTypes.eventId, eventId))
    .orderBy(participationTypes.sortOrder, participationTypes.label)

  return {
    event: {
      id: evento.id,
      slug: evento.slug,
      cpfSalt: evento.cpfSalt,
      search: {
        byCpf: evento.searchByCpf,
        byEmail: evento.searchByEmail,
        byName: evento.searchByName,
        birthDate: evento.searchBirthDate,
        mode: evento.searchMode,
      },
    },
    types: tipos.map((tipo) => ({
      id: tipo.id,
      slug: tipo.slug,
      label: tipo.label,
      aliases: tipo.aliases,
      // O modelo foi validado ao salvar; se um dia não for, o tipo fica sem
      // campos em vez de derrubar a importação inteira.
      dataFields:
        tipo.templateId === null
          ? null
          : (camposSchema.safeParse(tipo.dataFields).data ?? []),
      templateId: tipo.templateId,
      columnMapping: tipo.columnMapping ?? {},
    })),
  }
}

/** No modo vários tipos, os campos são a união por chave dos modelos do evento. */
export function mappingContextFor(
  contexto: ImportContext,
  participationTypeId: string | null,
): MappingContext {
  const tipos =
    participationTypeId === null
      ? contexto.types
      : contexto.types.filter((tipo) => tipo.id === participationTypeId)
  const campos = new Map<string, DataField>()
  const preset: Record<string, string> = {}
  for (const tipo of tipos) {
    for (const campo of tipo.dataFields ?? [])
      if (!campos.has(campo.key)) campos.set(campo.key, campo)
    for (const [alvo, cabecalho] of Object.entries(tipo.columnMapping))
      preset[alvo] ??= cabecalho
  }
  return {
    multipleTypes: participationTypeId === null,
    dataFields: [...campos.values()],
    preset,
    searchByCpf: contexto.event.search.byCpf,
  }
}

/** A data em que o mesmo arquivo já foi aplicado no evento, se foi. */
export async function lastAppliedWithSameFile(
  tx: Transaction,
  eventId: string,
  fileSha256: string,
): Promise<Date | null> {
  const [lote] = await tx
    .select({ appliedAt: importBatches.appliedAt })
    .from(importBatches)
    .where(
      and(
        eq(importBatches.eventId, eventId),
        eq(importBatches.fileSha256, fileSha256),
        eq(importBatches.status, 'applied'),
      ),
    )
    .orderBy(desc(importBatches.appliedAt))
    .limit(1)
  return lote?.appliedAt ?? null
}
