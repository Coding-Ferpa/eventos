import { createHash } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { BUCKETS } from '@/lib/buckets'

import { artes } from '../support/artes'
import { fontesCuradas } from '../support/certificado'
import { abrirSessao, type CookiesFalsos, type Papel } from './sessao'

/**
 * A arte do modelo com o Storage local de verdade: URLs assinadas, envio pelo
 * "navegador" (fetch PUT), `attachArt` gerando o base.pdf canônico.
 */

const estado = vi.hoisted(() => ({ cookies: null as unknown }))
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve(estado.cookies) }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))

const { db } = await import('@/db/client')
const { certificateTemplates, events } = await import('@/db/schema')
const { createEvent } = await import('@/actions/events')
const { createTemplate, publishTemplate, saveTemplateDraft } =
  await import('@/actions/templates')
const { attachArt, createArtUploadUrls } = await import('@/actions/template-art')
const { layout } = await import('@/features/certificate/layout/layout')
const { supabaseAdmin } = await import('@/lib/supabase/admin')

const sessoes = new Map<Papel, CookiesFalsos>()
async function entrarComo(papel: Papel) {
  const sessao = sessoes.get(papel) ?? (await abrirSessao(papel))
  sessoes.set(papel, sessao)
  estado.cookies = sessao
}

/** Só a assinatura: é o que o servidor confere no fundo da prévia. */
const WEBP = new Uint8Array([
  ...new TextEncoder().encode('RIFF'),
  0x10,
  0,
  0,
  0,
  ...new TextEncoder().encode('WEBPVP8 '),
  0,
  0,
  0,
  0,
])

let eventoId: string
const modelos: string[] = []

beforeAll(async () => {
  await entrarComo('editor')
  const evento = await createEvent({
    title: `Evento de arte ${Date.now()}`,
    startsAt: '2027-03-10T19:00',
  })
  if (!evento.ok) throw new Error(evento.error.message)
  eventoId = evento.data.id
})

afterAll(async () => {
  for (const bucket of [BUCKETS.modelos, BUCKETS.previas]) {
    for (const modelo of modelos) {
      const { data: lotes } = await supabaseAdmin().storage.from(bucket).list(modelo)
      const caminhos: string[] = []
      for (const lote of lotes ?? []) {
        if (lote.id) caminhos.push(`${modelo}/${lote.name}`)
        const { data: dentro } = await supabaseAdmin()
          .storage.from(bucket)
          .list(`${modelo}/${lote.name}`)
        for (const arquivo of dentro ?? [])
          caminhos.push(`${modelo}/${lote.name}/${arquivo.name}`)
      }
      if (caminhos.length > 0) await supabaseAdmin().storage.from(bucket).remove(caminhos)
    }
  }
  await db()
    .delete(events)
    .where(inArray(events.id, [eventoId]))
})

async function novoModelo() {
  await entrarComo('editor')
  const resultado = await createTemplate({ eventId: eventoId, name: 'Modelo com arte' })
  if (!resultado.ok) throw new Error(resultado.error.message)
  modelos.push(resultado.data.id)
  return resultado.data.id
}

async function put(urlAssinada: string, corpo: Uint8Array, tipo: string) {
  const resposta = await fetch(urlAssinada, {
    method: 'PUT',
    body: corpo as Uint8Array<ArrayBuffer>,
    headers: { 'content-type': tipo },
  })
  if (!resposta.ok)
    throw new Error(`PUT falhou: ${resposta.status} ${await resposta.text()}`)
}

/** O caminho do navegador: pede as URLs, sobe arte e prévias, e anexa. */
async function subirArte(
  templateId: string,
  arte: Uint8Array,
  tipo: 'application/pdf' | 'image/png' | 'image/jpeg',
  paginas = 1,
  previa: Uint8Array = WEBP,
) {
  const urls = await createArtUploadUrls({
    templateId,
    art: { contentType: tipo, size: arte.byteLength },
    previews: paginas,
  })
  if (!urls.ok) throw new Error(urls.error.message)
  await put(urls.data.arte.urlAssinada, arte, tipo)
  for (const { urlAssinada } of urls.data.previas)
    await put(urlAssinada, previa, 'image/webp')

  return attachArt({
    templateId,
    artPath: urls.data.arte.caminho,
    previewPaths: urls.data.previas.map((p) => p.caminho),
  })
}

async function linha(id: string) {
  const [modelo] = await db()
    .select()
    .from(certificateTemplates)
    .where(eq(certificateTemplates.id, id))
  return modelo!
}

describe('attachArt', () => {
  it('PDF de duas páginas: base.pdf no Storage, páginas com a prévia de cada uma', async () => {
    const id = await novoModelo()
    const resultado = await subirArte(id, await artes.duasPaginas(), 'application/pdf', 2)
    if (!resultado.ok) throw new Error(resultado.error.message)

    const modelo = await linha(id)
    expect(modelo.artKind).toBe('pdf')
    expect(modelo.pages).toEqual([
      {
        width_pt: 841.89,
        height_pt: 595.28,
        preview_path: expect.stringMatching(/pagina-1\.webp$/),
      },
      {
        width_pt: 595.28,
        height_pt: 841.89,
        preview_path: expect.stringMatching(/pagina-2\.webp$/),
      },
    ])
    expect(modelo.basePdfPath).toBe(`${id}/base-${modelo.basePdfSha256}.pdf`)
    const { data } = await supabaseAdmin()
      .storage.from(BUCKETS.modelos)
      .download(modelo.basePdfPath!)
    expect(data!.size).toBe(modelo.basePdfSizeBytes)
  })

  // DoD do M6: trocar a arte de 150 para 300 dpi não move campo nenhum.
  it('trocar a arte de 150 por 300 dpi mantém as páginas e o plano idênticos', async () => {
    const id = await novoModelo()
    const baixa = await subirArte(id, artes.dpi150(), 'image/png')
    if (!baixa.ok) throw new Error(baixa.error.message)
    expect(baixa.data.warnings.map((aviso) => aviso.code)).toEqual(['ART_LOW_RESOLUTION'])
    const antes = await linha(id)

    const alta = await subirArte(id, artes.dpi300(), 'image/png')
    if (!alta.ok) throw new Error(alta.error.message)
    const depois = await linha(id)

    const tamanhos = (paginas: unknown) =>
      (paginas as { width_pt: number; height_pt: number }[]).map((p) => [
        p.width_pt,
        p.height_pt,
      ])
    expect(tamanhos(depois.pages)).toEqual(tamanhos(antes.pages))
    expect(depois.basePdfSha256).not.toBe(antes.basePdfSha256)

    const plano = (paginas: unknown) =>
      layout(
        {
          schema_version: 1,
          version: 1,
          base_pdf_path: 'x',
          base_pdf_sha256: 'a'.repeat(64),
          base_pdf_size_bytes: 1,
          pages: (paginas as { width_pt: number; height_pt: number }[]).map((p) => ({
            ...p,
            preview_path: null,
          })),
          data_fields: [],
          layout_fields: [
            {
              id: 'nome',
              kind: 'text',
              page: 1,
              box: { x: 0.1, y: 0.4, w: 0.8, h: 0.12 },
              content: '{{participant.full_name}}',
              font: 'curated:poppins-600',
              size_pt: 32,
              min_size_pt: 14,
              color: '#1E1E1E',
              h_align: 'center',
              v_align: 'middle',
              line_height: 1.15,
              max_lines: 2,
              fit: 'shrink_then_wrap',
              transform: 'none',
            },
          ],
        },
        {
          siteUrl: 'https://eventos.codingferpa.org',
          participant: { fullName: 'José Gonçalves', cpfLast3: null },
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
        fontesCuradas,
      )
    expect(plano(depois.pages)).toEqual(plano(antes.pages))
  })

  it('arte nova no rascunho não troca os bytes do base.pdf publicado', async () => {
    const id = await novoModelo()
    await subirArte(id, await artes.a4Paisagem(), 'application/pdf')
    const campo = (identificador: string, content: string) => ({
      id: identificador,
      kind: 'text' as const,
      page: 1 as const,
      box: { x: 0.1, y: 0.4, w: 0.8, h: 0.1 },
      content,
      font: 'curated:poppins-600',
      size_pt: 24,
      min_size_pt: 12,
      color: '#1E1E1E',
      h_align: 'center' as const,
      v_align: 'middle' as const,
      line_height: 1.15,
      max_lines: 2,
      fit: 'shrink_then_wrap' as const,
      transform: 'none' as const,
    })
    await saveTemplateDraft({
      id,
      data_fields: [],
      layout_fields: [
        campo('nome', '{{participant.full_name}}'),
        campo('codigo', '{{certificate.code}}'),
        {
          id: 'qr',
          kind: 'qr',
          page: 1,
          box: { x: 0.85, y: 0.75, w: 0.1, h: 0.15 },
          dark: '#000000',
          light: '#FFFFFF',
        },
      ],
    })
    const publicado = await publishTemplate({ id })
    if (!publicado.ok) throw new Error(publicado.error.message)
    const snapshot = (await linha(id)).publishedSnapshot as {
      base_pdf_path: string
      base_pdf_sha256: string
    }

    await subirArte(id, await artes.pdf16x9(), 'application/pdf')

    const { data } = await supabaseAdmin()
      .storage.from(BUCKETS.modelos)
      .download(snapshot.base_pdf_path)
    const bytes = new Uint8Array(await data!.arrayBuffer())
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      snapshot.base_pdf_sha256,
    )
  })

  it('PDF cifrado: o erro de arte chega com código e mensagem no campo', async () => {
    const id = await novoModelo()
    const resultado = await subirArte(id, await artes.cifrada(), 'application/pdf')
    expect(resultado).toMatchObject({
      ok: false,
      error: {
        code: 'art_encrypted',
        fieldErrors: { arte: [expect.stringMatching(/senha/)] },
      },
    })
    expect((await linha(id)).basePdfPath).toBeNull()
  })

  it('número de prévias diferente do de páginas é recusado', async () => {
    const id = await novoModelo()
    const resultado = await subirArte(id, await artes.duasPaginas(), 'application/pdf', 1)
    expect(resultado).toMatchObject({ ok: false, error: { code: 'validation_error' } })
  })

  it('prévia que não é WebP é recusada', async () => {
    const id = await novoModelo()
    const resultado = await subirArte(
      id,
      await artes.a4Paisagem(),
      'application/pdf',
      1,
      artes.dpi150(),
    )
    expect(resultado).toMatchObject({
      ok: false,
      error: { message: 'O fundo da prévia precisa ser WebP.' },
    })
  })

  it('arquivo de outro modelo não entra', async () => {
    const meu = await novoModelo()
    const outro = await novoModelo()
    const urls = await createArtUploadUrls({
      templateId: outro,
      art: { contentType: 'application/pdf', size: 100 },
      previews: 1,
    })
    if (!urls.ok) throw new Error(urls.error.message)
    const resultado = await attachArt({
      templateId: meu,
      artPath: urls.data.arte.caminho,
      previewPaths: urls.data.previas.map((p) => p.caminho),
    })
    expect(resultado).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })

  it('conta sem papel não pede URL de envio', async () => {
    const id = await novoModelo()
    await entrarComo('reader')
    const resultado = await createArtUploadUrls({
      templateId: id,
      art: { contentType: 'application/pdf', size: 100 },
      previews: 1,
    })
    expect(resultado).toMatchObject({ ok: false, error: { code: 'forbidden' } })
  })
})
