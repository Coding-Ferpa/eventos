import { describe, expect, it } from 'vitest'

import { contentDisposition } from './filename'

describe('contentDisposition (doc 05)', () => {
  it('primeiro nome em ASCII minúsculo, e o UTF-8 no filename*', () => {
    expect(contentDisposition('ferpa-tech-day', 'Ângela Muñoz Ñandú')).toBe(
      'attachment; filename="certificado-ferpa-tech-day-angela.pdf"; ' +
        "filename*=UTF-8''certificado-ferpa-tech-day-%C3%A2ngela.pdf",
    )
  })

  it('apóstrofo e hífen no primeiro nome não quebram o cabeçalho', () => {
    expect(contentDisposition('evento', 'Ana-Clara D’Ávila')).toMatch(
      /^attachment; filename="certificado-evento-ana-clara\.pdf"; filename\*=UTF-8''certificado-evento-ana-clara\.pdf$/,
    )
  })

  it('nome sem nenhuma letra ASCII ainda dá um arquivo com nome', () => {
    expect(contentDisposition('evento', 'Νίκος Παπαδόπουλος')).toMatch(
      /^attachment; filename="certificado-evento\.pdf"; filename\*=UTF-8''certificado-evento-%CE/,
    )
  })
})
