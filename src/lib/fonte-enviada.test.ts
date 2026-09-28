// @vitest-environment node

import * as fontkit from '@cantoo/fontkit'
import { describe, expect, it, vi } from 'vitest'

import { bytesDaFonte } from '../../tests/support/certificado'
import { avaliarFonteEnviada } from './fonte-enviada'

vi.mock('server-only', () => ({}))

describe('avaliarFonteEnviada', () => {
  it('TTF estático com o português: aceita, com família, peso e subset que volta íntegro', async () => {
    const avaliacao = await avaliarFonteEnviada(bytesDaFonte('Poppins-SemiBold.ttf'))
    expect(avaliacao).toEqual({
      ok: true,
      family: 'Poppins',
      weight: 600,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      subsetOk: true,
    })
  })

  it('coleção, WOFF e bytes que não são fonte ficam de fora', async () => {
    const com = (assinatura: string) =>
      new Uint8Array([...new TextEncoder().encode(assinatura), ...new Uint8Array(60)])
    for (const bytes of [com('ttcf'), com('wOFF'), com('wOF2'), com('%PDF')]) {
      expect(await avaliarFonteEnviada(bytes)).toMatchObject({
        ok: false,
        code: 'validation_error',
        message: 'Envie a fonte em TTF ou OTF, um arquivo por peso.',
      })
    }
  })

  it('assinatura certa e conteúdo quebrado: ilegível, sem estourar', async () => {
    const quebrada = new Uint8Array([0x00, 0x01, 0x00, 0x00, ...new Uint8Array(40)])
    expect(await avaliarFonteEnviada(quebrada)).toMatchObject({
      ok: false,
      code: 'validation_error',
      message: expect.stringMatching(/ler/),
    })
  })

  it('fonte sem os caracteres do português é recusada, com a lista', async () => {
    // Um recorte da Poppins só com o A: sem mapa de caracteres para o resto.
    const poppins = fontkit.create(bytesDaFonte('Poppins-Regular.ttf')) as fontkit.Font
    const recorte = poppins.createSubset()
    recorte.includeGlyph(poppins.glyphForCodePoint(65)!)
    const bytes = new Uint8Array(recorte.encode())

    const avaliacao = await avaliarFonteEnviada(bytes)
    expect(avaliacao).toMatchObject({ ok: false, code: 'font_missing_glyphs' })
    if (avaliacao.ok) return
    expect(avaliacao.message).toMatch(/^A fonte não tem Á .*Ç/)
  })
})
