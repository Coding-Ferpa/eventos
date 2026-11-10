'use server'

import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { BUCKETS } from '@/lib/buckets'
import type { Transaction } from '@/db/client'
import { certificateTemplates } from '@/db/schema'
import {
  ArtError,
  buildBasePdf,
  type ArtErrorCode,
} from '@/features/certificate/base-pdf'
import type { TemplatePage } from '@/features/certificate/schema'
import { tipoDeImagemPelosBytes } from '@/lib/image-signature'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { z } from '@/lib/zod'

import { defineAction, FalhaDaAction } from './define-action'
import type { ActionErrorCode } from './result'

/**
 * A arte do modelo (docs 05 e 07). O navegador sobe o original ao bucket
 * privado `templates` e o fundo da prévia de cada página, já rasterizado por
 * ele, ao bucket público `previews`, os dois por URL assinada: nada passa pela
 * função, que aceita no máximo 4,5 MB de corpo. Depois, o `attachArt` baixa o
 * original, gera o `base.pdf` canônico e grava páginas, sha256 e tamanho.
 */

const EXTENSAO = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
} as const

/** O teto do bucket `templates` (migration 0012). */
const LIMITE_DA_ARTE = 10 * 1024 * 1024

async function modeloExistente(tx: Transaction, id: string) {
  const [modelo] = await tx
    .select()
    .from(certificateTemplates)
    .where(eq(certificateTemplates.id, id))
    .for('update')
  if (!modelo) throw new FalhaDaAction('not_found', 'Não encontramos esse modelo.')
  return modelo
}

export const createArtUploadUrls = defineAction({
  nome: 'template.art_upload_urls',
  entidade: 'certificate_templates',
  papelMinimo: 'editor',
  schema: z.object({
    templateId: z.uuid(),
    art: z.object({
      contentType: z.enum(['application/pdf', 'image/png', 'image/jpeg'], {
        message: 'Envie a arte em PDF, PNG ou JPG.',
      }),
      size: z.int().positive().max(LIMITE_DA_ARTE, 'A arte pode ter até 10 MB.'),
    }),
    // Uma prévia por página: 1, ou 2 com verso.
    previews: z.int().min(1).max(2),
  }),
  async executar({ entrada, tx }) {
    await modeloExistente(tx, entrada.templateId)
    const lote = randomUUID()
    const original = `${entrada.templateId}/${lote}/original.${EXTENSAO[entrada.art.contentType]}`
    const previas = Array.from(
      { length: entrada.previews },
      (_, i) => `${entrada.templateId}/${lote}/pagina-${i + 1}.webp`,
    )

    const assinar = async (
      bucket: typeof BUCKETS.modelos | typeof BUCKETS.previas,
      caminho: string,
    ) => {
      const { data, error } = await supabaseAdmin()
        .storage.from(bucket)
        .createSignedUploadUrl(caminho)
      if (error) throw error
      return { caminho, urlAssinada: data.signedUrl }
    }

    return {
      data: {
        arte: await assinar(BUCKETS.modelos, original),
        previas: await Promise.all(
          previas.map((caminho) => assinar(BUCKETS.previas, caminho)),
        ),
      },
      entityId: entrada.templateId,
      diff: { lote },
    }
  },
})

const CODIGO_DA_ACAO: Record<ArtErrorCode, ActionErrorCode> = {
  ART_ENCRYPTED: 'art_encrypted',
  ART_ROTATED: 'art_rotated',
  ART_TOO_MANY_PAGES: 'art_too_many_pages',
  ART_TOO_SMALL: 'art_too_small',
  ART_TOO_HEAVY: 'art_too_heavy',
  ART_UNSUPPORTED_TYPE: 'art_unsupported_type',
  ART_UNREADABLE: 'art_unreadable',
}

/** O fundo da prévia tem de ser WebP de verdade, pelos bytes (migration 0012). */
async function conferirPrevia(caminho: string) {
  const { data, error } = await supabaseAdmin()
    .storage.from(BUCKETS.previas)
    .download(caminho)
  if (error || !data) {
    throw new FalhaDaAction(
      'not_found',
      'O fundo da prévia não chegou. Envie a arte de novo.',
    )
  }
  const inicio = new Uint8Array(await data.slice(0, 16).arrayBuffer())
  if (tipoDeImagemPelosBytes(inicio) !== 'webp') {
    throw new FalhaDaAction('validation_error', 'O fundo da prévia precisa ser WebP.')
  }
}

export const attachArt = defineAction({
  nome: 'template.attach_art',
  entidade: 'certificate_templates',
  papelMinimo: 'editor',
  schema: z.object({
    templateId: z.uuid(),
    artPath: z.string().min(1),
    previewPaths: z.array(z.string().min(1)).min(1).max(2),
  }),
  async executar({ entrada, tx }) {
    const modelo = await modeloExistente(tx, entrada.templateId)

    // Só arquivos que a createArtUploadUrls deste modelo assinou.
    const doModelo = (caminho: string) => caminho.startsWith(`${modelo.id}/`)
    if (!doModelo(entrada.artPath) || !entrada.previewPaths.every(doModelo)) {
      throw new FalhaDaAction('forbidden', 'Esses arquivos não são deste modelo.')
    }

    const { data: arquivo, error } = await supabaseAdmin()
      .storage.from(BUCKETS.modelos)
      .download(entrada.artPath)
    if (error || !arquivo) {
      throw new FalhaDaAction(
        'not_found',
        'A arte não chegou ao armazenamento. Envie de novo.',
      )
    }
    const arte = new Uint8Array(await arquivo.arrayBuffer())

    let base
    try {
      base = await buildBasePdf([arte])
    } catch (erro) {
      if (erro instanceof ArtError) {
        throw new FalhaDaAction(CODIGO_DA_ACAO[erro.code], erro.message, {
          arte: [erro.message],
        })
      }
      throw erro
    }

    if (entrada.previewPaths.length !== base.pages.length) {
      throw new FalhaDaAction(
        'validation_error',
        `A arte tem ${base.pages.length} página(s), e chegaram ${entrada.previewPaths.length} prévia(s). Envie de novo.`,
      )
    }
    for (const caminho of entrada.previewPaths) await conferirPrevia(caminho)

    // O nome carrega o sha256: o base.pdf de um snapshot publicado nunca é
    // sobrescrito pela arte nova do rascunho.
    const caminhoDaBase = `${modelo.id}/base-${base.sha256}.pdf`
    const { error: erroDoEnvio } = await supabaseAdmin()
      .storage.from(BUCKETS.modelos)
      .upload(caminhoDaBase, base.bytes, { contentType: 'application/pdf', upsert: true })
    if (erroDoEnvio) throw erroDoEnvio

    const pages: TemplatePage[] = base.pages.map((pagina, i) => ({
      ...pagina,
      preview_path: entrada.previewPaths[i]!,
    }))
    await tx
      .update(certificateTemplates)
      .set({
        // O buildBasePdf aceitou: se não é PNG nem JPG, é PDF.
        artKind: tipoDeImagemPelosBytes(arte) ? 'image' : 'pdf',
        artOriginalPath: entrada.artPath,
        basePdfPath: caminhoDaBase,
        basePdfSha256: base.sha256,
        basePdfSizeBytes: base.bytes.byteLength,
        pages,
      })
      .where(eq(certificateTemplates.id, modelo.id))

    return {
      data: { pages, warnings: base.warnings },
      entityId: modelo.id,
      diff: {
        base_pdf_sha256: [modelo.basePdfSha256, base.sha256],
        paginas: pages.map((pagina) => [pagina.width_pt, pagina.height_pt]),
      },
    }
  },
})
