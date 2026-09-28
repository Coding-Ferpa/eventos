'use server'

import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'

import type { Transaction } from '@/db/client'
import {
  certificateTemplates,
  certificates,
  customFonts,
  events,
  participants,
  participationTypes,
} from '@/db/schema'
import { findCuratedFont } from '@/features/certificate/fonts/catalog'
import { applyTransform } from '@/features/certificate/format'
import {
  publicationProblems,
  templateDraftSchema,
  type TemplateDraft,
} from '@/features/certificate/publish'
import {
  templateSnapshotSchema,
  textFieldSchema,
  type TemplatePage,
} from '@/features/certificate/schema'
import { certificateAssets } from '@/lib/certificate-assets'
import { z } from '@/lib/zod'

import { defineAction, FalhaDaAction } from './define-action'

/**
 * Modelos de certificado (doc 07). O rascunho é a cópia de trabalho e nunca
 * afeta downloads: o motor só lê o `published_snapshot`, que só o
 * `publishTemplate` escreve.
 */

/** Trava a linha até o fim da transação: publicar e salvar não se atropelam. */
async function modeloParaAlterar(tx: Transaction, id: string) {
  const [modelo] = await tx
    .select()
    .from(certificateTemplates)
    .where(eq(certificateTemplates.id, id))
    .for('update')
  if (!modelo) throw new FalhaDaAction('not_found', 'Não encontramos esse modelo.')
  return modelo
}

export const createTemplate = defineAction({
  nome: 'template.create',
  entidade: 'certificate_templates',
  papelMinimo: 'editor',
  schema: z.object({
    eventId: z.uuid(),
    name: z.string().trim().min(2, 'Dê um nome ao modelo.').max(80),
  }),
  async executar({ entrada, tx }) {
    const [evento] = await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, entrada.eventId))
    if (!evento) throw new FalhaDaAction('not_found', 'Não encontramos esse evento.')

    const [modelo] = await tx
      .insert(certificateTemplates)
      .values({ eventId: entrada.eventId, name: entrada.name })
      .returning({ id: certificateTemplates.id })
    if (!modelo) throw new Error('O insert do modelo não devolveu a linha.')

    return { data: modelo, entityId: modelo.id, diff: { name: entrada.name } }
  },
})

export const saveTemplateDraft = defineAction({
  nome: 'template.save_draft',
  entidade: 'certificate_templates',
  papelMinimo: 'editor',
  schema: templateDraftSchema.safeExtend({ id: z.uuid() }),
  async executar({ entrada, tx }) {
    const { id, ...rascunho } = entrada
    await modeloParaAlterar(tx, id)

    await tx
      .update(certificateTemplates)
      .set({ dataFields: rascunho.data_fields, layoutFields: rascunho.layout_fields })
      .where(eq(certificateTemplates.id, id))

    return {
      data: null,
      entityId: id,
      // Contadores, e não o conteúdo: o texto dos campos pode ser longo.
      diff: {
        data_fields: rascunho.data_fields.length,
        layout_fields: rascunho.layout_fields.length,
      },
    }
  },
})

/** Regra 5: curada fora do catálogo, ou enviada que não existe ou não cobre o português. */
async function fontesInutilizaveis(tx: Transaction, rascunho: TemplateDraft) {
  const referencias = [
    ...new Set(
      rascunho.layout_fields.flatMap((campo) =>
        campo.kind === 'text' ? [campo.font] : [],
      ),
    ),
  ]
  const enviadas = referencias
    .filter((ref) => ref.startsWith('custom:'))
    .map((ref) => ref.slice('custom:'.length))

  const boas = new Set<string>()
  if (enviadas.length > 0) {
    const linhas = await tx
      .select({ id: customFonts.id })
      .from(customFonts)
      .where(
        and(inArray(customFonts.id, enviadas), eq(customFonts.glyphCoverageOk, true)),
      )
    for (const { id } of linhas) boas.add(`custom:${id}`)
  }

  return referencias.filter((ref) =>
    ref.startsWith('curated:') ? !findCuratedFont(ref) : !boas.has(ref),
  )
}

/**
 * Regra 7: para cada campo obrigatório sem padrão, quantos certificados ativos
 * dos tipos que usam este modelo estão sem ele.
 */
async function obrigatoriosFaltando(
  tx: Transaction,
  modeloId: string,
  rascunho: TemplateDraft,
) {
  const obrigatorios = rascunho.data_fields.filter(
    (campo) => campo.required && !campo.default?.trim(),
  )
  const faltando: { key: string; count: number }[] = []
  for (const campo of obrigatorios) {
    const [linha] = await tx
      .select({ total: count() })
      .from(certificates)
      .innerJoin(
        participationTypes,
        eq(participationTypes.id, certificates.participationTypeId),
      )
      .where(
        and(
          eq(participationTypes.certificateTemplateId, modeloId),
          eq(certificates.status, 'active'),
          sql`coalesce(btrim(${certificates.data} ->> ${campo.key}), '') = ''`,
        ),
      )
    if ((linha?.total ?? 0) > 0) faltando.push({ key: campo.key, count: linha!.total })
  }
  return faltando
}

export const publishTemplate = defineAction({
  nome: 'template.publish',
  entidade: 'certificate_templates',
  papelMinimo: 'editor',
  schema: z.object({ id: z.uuid() }),
  async executar({ entrada, tx }) {
    const modelo = await modeloParaAlterar(tx, entrada.id)

    // O rascunho já passou por este schema ao ser salvo; conferir de novo é
    // barato e protege de linha escrita por outro caminho.
    const lido = templateDraftSchema.safeParse({
      data_fields: modelo.dataFields,
      layout_fields: modelo.layoutFields,
    })
    if (!lido.success) {
      throw new FalhaDaAction(
        'template_publish_blocked',
        'O rascunho tem erros. Abra o editor, corrija e salve antes de publicar.',
      )
    }
    const rascunho = lido.data
    const paginas = (modelo.pages ?? []) as TemplatePage[]

    const problemas = publicationProblems({
      draft: rascunho,
      hasBasePdf: modelo.basePdfPath !== null,
      pageCount: paginas.length,
      unusableFonts: await fontesInutilizaveis(tx, rascunho),
      missingRequired: await obrigatoriosFaltando(tx, modelo.id, rascunho),
    })
    if (problemas.length > 0) {
      throw new FalhaDaAction(
        'template_publish_blocked',
        'O modelo ainda não pode ser publicado.',
        { publicar: problemas.map((problema) => problema.message) },
      )
    }

    const versao = modelo.version + 1
    const snapshot = templateSnapshotSchema.parse({
      schema_version: 1,
      version: versao,
      base_pdf_path: modelo.basePdfPath,
      base_pdf_sha256: modelo.basePdfSha256,
      base_pdf_size_bytes: modelo.basePdfSizeBytes,
      pages: paginas,
      data_fields: rascunho.data_fields,
      layout_fields: rascunho.layout_fields,
    })

    await tx
      .update(certificateTemplates)
      .set({
        status: 'published',
        version: versao,
        publishedSnapshot: snapshot,
        publishedAt: new Date(),
      })
      .where(eq(certificateTemplates.id, modelo.id))

    const [evento] = await tx
      .select({ slug: events.slug })
      .from(events)
      .where(eq(events.id, modelo.eventId))

    return {
      data: { version: versao },
      entityId: modelo.id,
      diff: { version: [modelo.version, versao] },
      tags: evento ? [`event:${evento.slug}`] : [],
    }
  },
})

export const deleteTemplate = defineAction({
  nome: 'template.delete',
  entidade: 'certificate_templates',
  papelMinimo: 'admin',
  schema: z.object({ id: z.uuid() }),
  async executar({ entrada, tx }) {
    const modelo = await modeloParaAlterar(tx, entrada.id)
    if (modelo.status !== 'draft') {
      throw new FalhaDaAction(
        'conflict',
        'Um modelo publicado não se apaga: certificados já podem ter saído com ele.',
      )
    }
    const [emUso] = await tx
      .select({ total: count() })
      .from(participationTypes)
      .where(eq(participationTypes.certificateTemplateId, modelo.id))
    if ((emUso?.total ?? 0) > 0) {
      throw new FalhaDaAction(
        'conflict',
        'Há tipos de participação usando este modelo. Troque o modelo deles antes.',
      )
    }

    await tx.delete(certificateTemplates).where(eq(certificateTemplates.id, modelo.id))
    return { data: null, entityId: modelo.id, diff: { name: modelo.name } }
  },
})

/** O nome do doc 05 para evento ainda sem participantes. */
export const NOME_CANONICO = 'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues'

type AmostraDeNome = { nome: string; origem: 'evento' | 'canonico' }

/**
 * "Testar com o nome mais longo deste evento" (doc 05): os 5 nomes com mais
 * caracteres, medidos com a fonte e a transformação que estão na tela (salvas
 * ou não), e vale o mais largo. É leitura, mas é action para passar pela
 * sessão e pelo papel; o nome não vai para a auditoria.
 */
export const getLongestNameSample = defineAction({
  nome: 'template.longest_name_sample',
  entidade: 'certificate_templates',
  papelMinimo: 'editor',
  schema: z.object({
    templateId: z.uuid(),
    font: textFieldSchema.shape.font,
    transform: textFieldSchema.shape.transform,
  }),
  async executar({
    entrada,
    tx,
  }): Promise<{ data: AmostraDeNome; entityId: string; diff?: unknown }> {
    const [modelo] = await tx
      .select({ eventId: certificateTemplates.eventId })
      .from(certificateTemplates)
      .where(eq(certificateTemplates.id, entrada.templateId))
    if (!modelo) throw new FalhaDaAction('not_found', 'Não encontramos esse modelo.')

    const linhas = await tx
      .select({ fullName: participants.fullName })
      .from(participants)
      .where(eq(participants.eventId, modelo.eventId))
      .orderBy(desc(sql`char_length(${participants.fullName})`))
      .limit(5)
    if (linhas.length === 0) {
      return {
        data: { nome: NOME_CANONICO, origem: 'canonico' },
        entityId: entrada.templateId,
      }
    }

    const metrics = await certificateAssets.metrics(entrada.font)
    const largura = (nome: string) =>
      metrics.widthAt(applyTransform(nome, entrada.transform), 1)
    const maisLargo = linhas
      .map((linha) => linha.fullName)
      .reduce((melhor, nome) => (largura(nome) > largura(melhor) ? nome : melhor))

    return {
      data: { nome: maisLargo, origem: 'evento' },
      entityId: entrada.templateId,
      diff: { font: entrada.font },
    }
  },
})
