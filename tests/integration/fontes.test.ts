import { eq, inArray } from 'drizzle-orm'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { artes } from '../support/artes'
import { bytesDaFonte, extrairTexto } from '../support/certificado'
import { abrirSessao, type CookiesFalsos, type Papel } from './sessao'

/**
 * Fonte enviada pelo admin (doc 05), com o Storage local: URL assinada,
 * envio, avaliação no servidor (formato, cobertura, ida e volta do subset).
 */

const estado = vi.hoisted(() => ({ cookies: null as unknown }))
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(estado.cookies) }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

const { db } = await import('@/db/client')
const { customFonts } = await import('@/db/schema')
const { createFontUploadUrl, uploadCustomFont } = await import('@/actions/fonts')
const { supabaseAdmin } = await import('@/lib/supabase/admin')
const { certificateAssets } = await import('@/lib/certificate-assets')
const { buildBasePdf } = await import('@/features/certificate/base-pdf')
const { generateCertificatePdf } = await import('@/features/certificate/index')

const sessoes = new Map<Papel, CookiesFalsos>()
async function entrarComo(papel: Papel) {
  const sessao = sessoes.get(papel) ?? (await abrirSessao(papel))
  sessoes.set(papel, sessao)
  estado.cookies = sessao
}

const fontes: string[] = []
const arquivos: string[] = []

afterAll(async () => {
  if (fontes.length > 0)
    await db().delete(customFonts).where(inArray(customFonts.id, fontes))
  if (arquivos.length > 0) await supabaseAdmin().storage.from('fonts').remove(arquivos)
})

async function enviar(bytes: Uint8Array, extension: 'ttf' | 'otf' = 'ttf') {
  await entrarComo('editor')
  const url = await createFontUploadUrl({ extension, size: bytes.byteLength })
  if (!url.ok) throw new Error(url.error.message)
  arquivos.push(url.data.caminho)
  const resposta = await fetch(url.data.urlAssinada, {
    method: 'PUT',
    body: bytes as Uint8Array<ArrayBuffer>,
    headers: { 'content-type': 'font/ttf' },
  })
  if (!resposta.ok) throw new Error(`PUT falhou: ${resposta.status}`)
  return url.data.caminho
}

async function existe(caminho: string) {
  const { data } = await supabaseAdmin()
    .storage.from('fonts')
    .list('', { search: caminho })
  return (data ?? []).some((objeto) => objeto.name === caminho)
}

describe('uploadCustomFont', () => {
  it('TTF estático com o português entra, com o subset testado', async () => {
    const caminho = await enviar(bytesDaFonte('Poppins-SemiBold.ttf'))
    const resultado = await uploadCustomFont({
      storagePath: caminho,
      family: 'Poppins',
      weight: 600,
    })
    if (!resultado.ok) throw new Error(resultado.error.message)
    fontes.push(resultado.data.id)

    expect(resultado.data).toMatchObject({ subsetOk: true, repetida: false })
    const [linha] = await db()
      .select()
      .from(customFonts)
      .where(eq(customFonts.id, resultado.data.id))
    expect(linha).toMatchObject({
      family: 'Poppins',
      weight: 600,
      glyphCoverageOk: true,
      subsetOk: true,
    })

    // A mesma fonte de novo: vale a primeira, e o arquivo repetido sai do bucket.
    const outro = await enviar(bytesDaFonte('Poppins-SemiBold.ttf'))
    const repetida = await uploadCustomFont({
      storagePath: outro,
      family: 'Poppins',
      weight: 600,
    })
    expect(repetida).toMatchObject({
      ok: true,
      data: { id: resultado.data.id, repetida: true },
    })
    expect(await existe(outro)).toBe(false)

    // E o motor a usa, lida do banco e do bucket privado.
    const ref = `custom:${resultado.data.id}`
    const base = await buildBasePdf([await artes.a4Paisagem()])
    const snapshot = {
      schema_version: 1 as const,
      version: 1,
      base_pdf_path: 'x',
      base_pdf_sha256: base.sha256,
      base_pdf_size_bytes: base.bytes.byteLength,
      pages: base.pages.map((pagina) => ({ ...pagina, preview_path: null })),
      data_fields: [],
      layout_fields: [
        {
          id: 'nome',
          kind: 'text' as const,
          page: 1 as const,
          box: { x: 0.1, y: 0.4, w: 0.8, h: 0.12 },
          content: '{{participant.full_name}}',
          font: ref,
          size_pt: 32,
          min_size_pt: 14,
          color: '#1E1E1E',
          h_align: 'center' as const,
          v_align: 'middle' as const,
          line_height: 1.15,
          max_lines: 2,
          fit: 'shrink_then_wrap' as const,
          transform: 'none' as const,
        },
      ],
    }
    const { fonts, fontBytes } = await certificateAssets.fonts(snapshot)
    const { pdf, warnings } = await generateCertificatePdf({
      snapshot,
      context: {
        siteUrl: 'https://eventos.codingferpa.org',
        participant: { fullName: 'José Gonçalves de Assunção', cpfLast3: null },
        event: {
          title: 'X',
          locationName: null,
          city: null,
          startsAt: new Date('2027-03-10T22:00:00Z'),
          endsAt: null,
        },
        participation: { label: 'Participante' },
        certificate: {
          hours: 8,
          code: 'DEM0CF2026',
          issuedAt: null,
          sequence: 1,
          data: {},
        },
      },
      basePdf: base.bytes,
      fonts,
      fontBytes,
    })
    expect(warnings).toEqual([])
    expect((await extrairTexto(pdf))[0]!.map((t) => t.text).join('')).toBe(
      'José Gonçalves de Assunção',
    )
  })

  it('arquivo que não é fonte é recusado e sai do bucket', async () => {
    const caminho = await enviar(new TextEncoder().encode('isto não é uma fonte'))
    const resultado = await uploadCustomFont({
      storagePath: caminho,
      family: 'X',
      weight: 400,
    })
    expect(resultado).toMatchObject({
      ok: false,
      error: {
        code: 'validation_error',
        fieldErrors: { fonte: [expect.stringMatching(/TTF ou OTF/)] },
      },
    })
    expect(await existe(caminho)).toBe(false)
  })

  it('conta sem papel não pede URL de envio', async () => {
    await entrarComo('reader')
    expect(await createFontUploadUrl({ extension: 'ttf', size: 1000 })).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    })
  })
})
