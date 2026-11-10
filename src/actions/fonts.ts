'use server'

import { randomUUID } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'

import { BUCKETS } from '@/lib/buckets'
import { customFonts } from '@/db/schema'
import { avaliarFonteEnviada } from '@/lib/fonte-enviada'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { z } from '@/lib/zod'

import { defineAction, FalhaDaAction } from './define-action'

/**
 * Fontes enviadas pelo admin (docs 05 e 07). O arquivo sobe direto ao bucket
 * privado `fonts` por URL assinada; o `uploadCustomFont` baixa, avalia e só
 * então grava. Arquivo recusado sai do bucket.
 */

/** O teto do bucket `fonts` (migration 0012). */
const LIMITE = 2 * 1024 * 1024

export const createFontUploadUrl = defineAction({
  nome: 'font.upload_url',
  entidade: 'custom_fonts',
  papelMinimo: 'editor',
  schema: z.object({
    extension: z.enum(['ttf', 'otf'], { message: 'Envie a fonte em TTF ou OTF.' }),
    size: z.int().positive().max(LIMITE, 'A fonte pode ter até 2 MB.'),
  }),
  async executar({ entrada }) {
    const caminho = `${randomUUID()}.${entrada.extension}`
    const { data, error } = await supabaseAdmin()
      .storage.from(BUCKETS.fontes)
      .createSignedUploadUrl(caminho)
    if (error) throw error
    return { data: { caminho, urlAssinada: data.signedUrl }, diff: { caminho } }
  },
})

export const uploadCustomFont = defineAction({
  nome: 'font.upload',
  entidade: 'custom_fonts',
  papelMinimo: 'editor',
  schema: z.object({
    storagePath: z
      .string()
      .regex(/^[0-9a-f-]{36}\.(ttf|otf)$/, 'Arquivo de fonte inválido.'),
    // Sem família e peso, valem os do próprio arquivo: pedir ao admin que
    // digite o peso só abre espaço para divergir dele.
    family: z.string().trim().min(1).max(80).optional(),
    weight: z.int().min(100).max(900).multipleOf(100).optional(),
  }),
  async executar({ entrada, usuario, tx }) {
    const { data: arquivo, error } = await supabaseAdmin()
      .storage.from(BUCKETS.fontes)
      .download(entrada.storagePath)
    if (error || !arquivo) {
      throw new FalhaDaAction(
        'not_found',
        'A fonte não chegou ao armazenamento. Envie de novo.',
      )
    }

    const avaliacao = await avaliarFonteEnviada(
      new Uint8Array(await arquivo.arrayBuffer()),
    )
    if (!avaliacao.ok) {
      await supabaseAdmin().storage.from(BUCKETS.fontes).remove([entrada.storagePath])
      throw new FalhaDaAction(avaliacao.code, avaliacao.message, {
        fonte: [avaliacao.message],
      })
    }

    // A mesma fonte enviada duas vezes: vale a primeira, e o arquivo novo sai.
    const [existente] = await tx
      .select({ id: customFonts.id })
      .from(customFonts)
      .where(eq(customFonts.sha256, avaliacao.sha256))
    if (existente) {
      await supabaseAdmin().storage.from(BUCKETS.fontes).remove([entrada.storagePath])
      return {
        data: { id: existente.id, subsetOk: avaliacao.subsetOk, repetida: true },
        entityId: existente.id,
        diff: { repetida: true },
      }
    }

    const [fonte] = await tx
      .insert(customFonts)
      .values({
        family: entrada.family ?? avaliacao.family,
        weight: entrada.weight ?? avaliacao.weight,
        storagePath: entrada.storagePath,
        sha256: avaliacao.sha256,
        subsetOk: avaliacao.subsetOk,
        glyphCoverageOk: true,
        uploadedBy: usuario.id,
      })
      .returning({ id: customFonts.id })
    if (!fonte) throw new Error('O insert da fonte não devolveu a linha.')

    return {
      data: { id: fonte.id, subsetOk: avaliacao.subsetOk, repetida: false },
      entityId: fonte.id,
      diff: {
        family: entrada.family ?? avaliacao.family,
        weight: entrada.weight ?? avaliacao.weight,
        subsetOk: avaliacao.subsetOk,
      },
    }
  },
})

/**
 * URLs de leitura das fontes enviadas, para a prévia do editor rodar o motor
 * no navegador: o bucket `fonts` é privado. Valem uma hora.
 */
export const createFontReadUrls = defineAction({
  nome: 'font.read_urls',
  entidade: 'custom_fonts',
  papelMinimo: 'editor',
  schema: z.object({ ids: z.array(z.uuid()).min(1).max(40) }),
  async executar({ entrada, tx }) {
    const linhas = await tx
      .select({ id: customFonts.id, storagePath: customFonts.storagePath })
      .from(customFonts)
      .where(inArray(customFonts.id, entrada.ids))

    const urls: Record<string, string> = {}
    for (const linha of linhas) {
      const { data, error } = await supabaseAdmin()
        .storage.from(BUCKETS.fontes)
        .createSignedUrl(linha.storagePath, 60 * 60)
      if (error) throw error
      urls[linha.id] = data.signedUrl
    }
    return { data: urls, diff: { total: linhas.length } }
  },
})
