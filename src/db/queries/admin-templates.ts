import 'server-only'

import { asc, desc, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import {
  certificateTemplates,
  customFonts,
  events,
  participationTypes,
} from '@/db/schema'
import type { DataField, LayoutField, TemplatePage } from '@/features/certificate/schema'

/**
 * Leituras do editor de modelos. Pela conexão privilegiada: as páginas que as
 * chamam já passaram pelo guarda de papel do layout do admin (doc 08).
 */

export async function listarModelosDoEvento(eventoId: string) {
  const linhas = await db()
    .select({
      id: certificateTemplates.id,
      name: certificateTemplates.name,
      status: certificateTemplates.status,
      version: certificateTemplates.version,
      basePdfPath: certificateTemplates.basePdfPath,
      updatedAt: certificateTemplates.updatedAt,
    })
    .from(certificateTemplates)
    .where(eq(certificateTemplates.eventId, eventoId))
    .orderBy(asc(certificateTemplates.createdAt))
  return linhas.map(({ basePdfPath, ...modelo }) => ({
    ...modelo,
    temArte: basePdfPath !== null,
  }))
}

export async function buscarModeloParaEditor(modeloId: string) {
  const [modelo] = await db()
    .select()
    .from(certificateTemplates)
    .where(eq(certificateTemplates.id, modeloId))
  if (!modelo) return null

  const [[evento], tipos, fontes] = await Promise.all([
    db()
      .select({
        id: events.id,
        title: events.title,
        slug: events.slug,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        city: events.city,
        locationName: events.locationName,
      })
      .from(events)
      .where(eq(events.id, modelo.eventId)),
    db()
      .select({
        id: participationTypes.id,
        label: participationTypes.label,
        defaultHours: participationTypes.defaultHours,
      })
      .from(participationTypes)
      .where(eq(participationTypes.certificateTemplateId, modelo.id))
      .orderBy(asc(participationTypes.sortOrder)),
    db()
      .select({
        id: customFonts.id,
        family: customFonts.family,
        weight: customFonts.weight,
      })
      .from(customFonts)
      .where(eq(customFonts.glyphCoverageOk, true))
      .orderBy(asc(customFonts.family), asc(customFonts.weight)),
  ])
  if (!evento) return null

  return {
    modelo: {
      id: modelo.id,
      name: modelo.name,
      status: modelo.status,
      version: modelo.version,
      publishedAt: modelo.publishedAt,
      updatedAt: modelo.updatedAt,
      pages: (modelo.pages ?? []) as TemplatePage[],
      temArte: modelo.basePdfPath !== null,
      // O rascunho foi validado ao ser salvo; aqui ele só é lido.
      dataFields: modelo.dataFields as DataField[],
      layoutFields: modelo.layoutFields as LayoutField[],
    },
    evento,
    tipos,
    fontesEnviadas: fontes,
  }
}

/** Os modelos de um evento para o seletor de cada tipo de participação. */
export async function modelosParaTipos(eventoId: string) {
  return db()
    .select({ id: certificateTemplates.id, name: certificateTemplates.name })
    .from(certificateTemplates)
    .where(eq(certificateTemplates.eventId, eventoId))
    .orderBy(desc(certificateTemplates.updatedAt))
}
