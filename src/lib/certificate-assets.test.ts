// @vitest-environment node

import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import type { TemplateSnapshot } from '@/features/certificate/schema'

import { createCertificateAssets, lerFonteCuradaDoDisco } from './certificate-assets'

vi.mock('server-only', () => ({}))

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

function arte(n: number) {
  const bytes = new TextEncoder().encode(`%PDF-1.7 arte ${n}`)
  return { bytes, base_pdf_path: `modelo-${n}/base.pdf`, base_pdf_sha256: sha(bytes) }
}

function montar(artes: ReturnType<typeof arte>[]) {
  const porCaminho = new Map(artes.map((a) => [a.base_pdf_path, a.bytes]))
  const baixarBasePdf = vi.fn(async (caminho: string) => {
    await Promise.resolve()
    const bytes = porCaminho.get(caminho)
    if (!bytes) throw new Error(`não existe: ${caminho}`)
    return bytes
  })
  const lerFonteCurada = vi.fn(lerFonteCuradaDoDisco)
  return {
    assets: createCertificateAssets({ baixarBasePdf, lerFonteCurada }),
    baixarBasePdf,
    lerFonteCurada,
  }
}

const SNAPSHOT: Pick<TemplateSnapshot, 'layout_fields'> = {
  layout_fields: [
    {
      id: 'nome',
      kind: 'text',
      page: 1,
      box: { x: 0.1, y: 0.4, w: 0.8, h: 0.12 },
      content: '{{participant.full_name}}',
      font: 'curated:poppins-700',
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
}

describe('base.pdf no cache de módulo', () => {
  it('baixa uma vez, mesmo com cem pedidos simultâneos no cache frio', async () => {
    const a = arte(1)
    const { assets, baixarBasePdf } = montar([a])

    const todos = await Promise.all(Array.from({ length: 100 }, () => assets.basePdf(a)))

    expect(baixarBasePdf).toHaveBeenCalledTimes(1)
    expect(new Set(todos).size).toBe(1)
    expect(todos[0]).toEqual(a.bytes)
  })

  it('guarda no máximo 8, e o usado há pouco fica', async () => {
    const artes = Array.from({ length: 9 }, (_, n) => arte(n))
    const { assets, baixarBasePdf } = montar(artes)

    for (const a of artes.slice(0, 8)) await assets.basePdf(a)
    await assets.basePdf(artes[0]!) // a primeira volta a ser a mais recente
    await assets.basePdf(artes[8]!) // a nona expulsa a menos usada, a segunda
    baixarBasePdf.mockClear()

    await assets.basePdf(artes[0]!)
    expect(baixarBasePdf).not.toHaveBeenCalled()
    await assets.basePdf(artes[1]!)
    expect(baixarBasePdf).toHaveBeenCalledTimes(1)
  })

  it('bytes que não batem com o sha256 do snapshot são recusados e não ficam', async () => {
    const a = arte(1)
    const { assets, baixarBasePdf } = montar([{ ...a, bytes: new Uint8Array([1, 2, 3]) }])

    await expect(assets.basePdf(a)).rejects.toThrow(/sha256/)
    await expect(assets.basePdf(a)).rejects.toThrow(/sha256/)
    expect(baixarBasePdf).toHaveBeenCalledTimes(2)
  })

  it('falha de download não envenena o cache', async () => {
    const a = arte(1)
    const { assets, baixarBasePdf } = montar([a])
    baixarBasePdf.mockRejectedValueOnce(new Error('Storage fora do ar'))

    await expect(assets.basePdf(a)).rejects.toThrow('Storage fora do ar')
    await expect(assets.basePdf(a)).resolves.toEqual(a.bytes)
  })
})

describe('fontes no cache de módulo', () => {
  it('lê do disco uma vez e entrega a fonte de cada campo', async () => {
    const { assets, lerFonteCurada } = montar([])
    const doisPesos = {
      layout_fields: [
        ...SNAPSHOT.layout_fields,
        { ...SNAPSHOT.layout_fields[0]!, id: 'texto', font: 'curated:poppins-400' },
      ],
    } as Pick<TemplateSnapshot, 'layout_fields'>
    const primeira = await assets.fonts(doisPesos)
    const segunda = await assets.fonts(SNAPSHOT)

    // A reserva de cada peso também é Poppins até o M6: nenhuma leitura a mais.
    expect(lerFonteCurada.mock.calls.map(([arquivo]) => arquivo).sort()).toEqual([
      'Poppins-Bold.ttf',
      'Poppins-Regular.ttf',
    ])
    expect(primeira.fonts('curated:poppins-700').weight).toBe(700)
    expect(primeira.fonts('curated:poppins-400').metrics.unitsPerEm).toBe(1000)
    // Mesmos bytes, mesma fonte parseada: o pdf-lib não parseia de novo.
    expect(segunda.fontBytes('curated:poppins-700')).toBe(
      primeira.fontBytes('curated:poppins-700'),
    )
    expect(segunda.fonts('curated:poppins-700').metrics).toBe(
      primeira.fonts('curated:poppins-700').metrics,
    )
  })

  it('fonte que o modelo não pediu nem é de reserva é erro, não fallback silencioso', async () => {
    const { assets } = montar([])
    const { fonts, fontBytes } = await assets.fonts(SNAPSHOT)
    expect(() => fonts('curated:inter-400')).toThrow(/inter-400/)
    expect(() => fontBytes('curated:inter-400')).toThrow(/inter-400/)
  })

  it('fonte enviada ainda não tem leitor: erro claro até o M6', async () => {
    const { assets } = montar([])
    const comEnviada = {
      layout_fields: [
        {
          ...SNAPSHOT.layout_fields[0]!,
          font: 'custom:0b4ed4e6-2a4c-4f7e-9d71-1f5e2d3c4b5a',
        },
      ],
    } as Pick<TemplateSnapshot, 'layout_fields'>
    await expect(assets.fonts(comEnviada)).rejects.toThrow(/enviada/)
  })

  it('a pasta das fontes curadas é lida a partir do diretório do processo', async () => {
    const bytes = await lerFonteCuradaDoDisco('Poppins-Regular.ttf')
    expect(bytes.byteLength).toBe(160316)
  })
})
