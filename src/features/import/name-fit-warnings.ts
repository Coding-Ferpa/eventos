import 'server-only'

import { eq, inArray } from 'drizzle-orm'

import type { Transaction } from '@/db/client'
import type { ImportContext } from '@/db/queries/imports'
import { certificateTemplates, events } from '@/db/schema'
import type { FontResolver } from '@/features/certificate/layout/layout'
import { layoutFieldSchema, pageSchema } from '@/features/certificate/schema'
import { certificateAssets } from '@/lib/certificate-assets'
import { siteEnv } from '@/lib/env'
import { logger } from '@/lib/logger'
import { z } from '@/lib/zod'

import { nameFields, nameIsBelowMin, type NameLayout } from './name-fit'
import type { StagedRow } from './validate-row'

/**
 * LAYOUT_BELOW_MIN_SIZE na prévia (doc 06): o nome de cada linha medido no
 * modelo do tipo dela. Vale o snapshot publicado, que é o que vai para o
 * certificado; sem publicação, o rascunho; sem arte, não há o que medir. Fonte
 * que não carrega não segura a prévia: só deixa de avisar, com log.
 */
export async function warnNamesBelowMin(
  tx: Transaction,
  contexto: ImportContext,
  linhas: StagedRow[],
): Promise<void> {
  const ids = [
    ...new Set(
      contexto.types
        .map((tipo) => tipo.templateId)
        .filter((id): id is string => id !== null),
    ),
  ]
  if (ids.length === 0) return
  const modelos = await tx
    .select({
      id: certificateTemplates.id,
      pages: certificateTemplates.pages,
      layoutFields: certificateTemplates.layoutFields,
      snapshot: certificateTemplates.publishedSnapshot,
    })
    .from(certificateTemplates)
    .where(inArray(certificateTemplates.id, ids))
  const [evento] = await tx.select().from(events).where(eq(events.id, contexto.event.id))
  if (!evento) return

  const porTipo = new Map<string, { modelo: NameLayout; rotulo: string }>()
  for (const tipo of contexto.types) {
    const linhaDoModelo = modelos.find((modelo) => modelo.id === tipo.templateId)
    if (!linhaDoModelo) continue
    const publicado = linhaDoModelo.snapshot as {
      pages?: unknown
      layout_fields?: unknown
    } | null
    const paginas = z
      .array(pageSchema)
      .safeParse(publicado?.pages ?? linhaDoModelo.pages).data
    const campos = z
      .array(layoutFieldSchema)
      .safeParse(publicado?.layout_fields ?? linhaDoModelo.layoutFields).data
    if (!paginas?.length || !campos) continue
    const modelo = {
      pages: paginas,
      dataFields: tipo.dataFields ?? [],
      nameFields: nameFields(campos),
    }
    if (modelo.nameFields.length > 0) porTipo.set(tipo.id, { modelo, rotulo: tipo.label })
  }
  if (porTipo.size === 0) return

  let fontes: FontResolver
  try {
    const campos = [...porTipo.values()].flatMap((doTipo) => doTipo.modelo.nameFields)
    fontes = (await certificateAssets.fonts({ layout_fields: campos })).fonts
  } catch {
    logger.warn({ event: 'import.name_fit_skipped', route: 'import.stage' })
    return
  }

  const base = {
    siteUrl: siteEnv().NEXT_PUBLIC_SITE_URL,
    event: {
      title: evento.title,
      locationName: evento.locationName,
      city: evento.city,
      startsAt: evento.startsAt,
      endsAt: evento.endsAt,
    },
  }
  for (const linha of linhas) {
    const doTipo = linha.participationTypeId
      ? porTipo.get(linha.participationTypeId)
      : undefined
    if (!doTipo || !linha.fullName) continue
    if (linha.issues.some((problema) => problema.severity === 'error')) continue
    const contextoDaLinha = {
      ...base,
      participation: { label: doTipo.rotulo },
      certificate: {
        hours: linha.hours ?? 0,
        code: '0000000000',
        issuedAt: null,
        sequence: 1,
        data: { ...linha.dataDefaults, ...linha.data },
      },
    }
    if (nameIsBelowMin(linha.fullName, doTipo.modelo, contextoDaLinha, fontes)) {
      linha.issues.push({
        code: 'LAYOUT_BELOW_MIN_SIZE',
        severity: 'warning',
        detail: `O nome fica abaixo do tamanho mínimo no modelo de ${doTipo.rotulo}: confira a caixa do nome no editor.`,
      })
    }
  }
}
