// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import { bytesDaFonte } from '../../tests/support/certificado'
import { avaliarFonteEnviada } from './fonte-enviada'

vi.mock('server-only', () => ({}))
// O pdf.js quebrado, como ficou no build de produção do M6 antes da correção.
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: () => {
    throw new Error('Setting up fake worker failed')
  },
}))

describe('avaliarFonteEnviada com o pdf.js em pane', () => {
  it('a pane sobe como erro, e não como "a fonte falhou no subset"', async () => {
    await expect(
      avaliarFonteEnviada(bytesDaFonte('Poppins-Regular.ttf')),
    ).rejects.toThrow('Setting up fake worker failed')
  })
})
