import { describe, expect, it } from 'vitest'

import { certificateEtag, ENGINE_VERSION, type EtagInput } from './etag'
import type { TokenContext } from './tokens'

const CONTEXTO: TokenContext = {
  siteUrl: 'https://eventos.codingferpa.org',
  participant: { fullName: 'José Gonçalves', cpfLast3: '145' },
  event: {
    title: 'Ferpa Tech Day 2026',
    locationName: 'Auditório',
    city: 'Fernandópolis',
    startsAt: new Date('2026-09-12T11:00:00Z'),
    endsAt: new Date('2026-09-12T20:00:00Z'),
  },
  participation: { label: 'Participante' },
  certificate: {
    hours: 8,
    code: 'DEM0CF2026',
    issuedAt: new Date('2026-09-14T15:00:00Z'),
    sequence: 42,
    data: { titulo_palestra: 'Git na prática', turma: 'A' },
  },
}

const BASE: EtagInput = {
  basePdfSha256: 'a'.repeat(64),
  templateVersion: 3,
  certificateVersion: 1,
  context: CONTEXTO,
}

const etag = (mudanca: Partial<EtagInput> = {}, versao?: number) =>
  certificateEtag({ ...BASE, ...mudanca }, versao)

const comContexto = (mudar: (c: TokenContext) => TokenContext) =>
  etag({ context: mudar(structuredClone(CONTEXTO)) })

describe('certificateEtag', () => {
  it('é um ETag forte: sha256 entre aspas', async () => {
    expect(await etag()).toMatch(/^"[0-9a-f]{64}"$/)
  })

  // PDF-23 do doc 05.
  it('não muda sem mudança, e muda com cada versão', async () => {
    const original = await etag()
    expect(await etag()).toBe(original)

    const mudados = await Promise.all([
      etag({ certificateVersion: 2 }),
      etag({ templateVersion: 4 }),
      etag({ basePdfSha256: 'b'.repeat(64) }),
      etag({}, ENGINE_VERSION + 1),
    ])
    expect(new Set([original, ...mudados]).size).toBe(5)
  })

  // O PDF imprime dados do evento e do tipo que nenhuma versão acompanha: sem
  // eles no ETag, corrigir o título do evento daria 304 com o PDF antigo.
  it.each<[string, (c: TokenContext) => TokenContext]>([
    [
      'título do evento',
      (c) => ({ ...c, event: { ...c.event, title: 'Ferpa Tech Day' } }),
    ],
    ['cidade', (c) => ({ ...c, event: { ...c.event, city: 'Jales' } })],
    ['local', (c) => ({ ...c, event: { ...c.event, locationName: null } })],
    [
      'início',
      (c) => ({
        ...c,
        event: { ...c.event, startsAt: new Date('2026-09-13T11:00:00Z') },
      }),
    ],
    ['fim', (c) => ({ ...c, event: { ...c.event, endsAt: null } })],
    ['rótulo do tipo', (c) => ({ ...c, participation: { label: 'Palestrante' } })],
    ['endereço do site', (c) => ({ ...c, siteUrl: 'https://outro.example' })],
    [
      'nome',
      (c) => ({
        ...c,
        participant: { ...c.participant, fullName: 'José Gonçalves Filho' },
      }),
    ],
    ['horas', (c) => ({ ...c, certificate: { ...c.certificate, hours: 4 } })],
    ['dados', (c) => ({ ...c, certificate: { ...c.certificate, data: { turma: 'B' } } })],
  ])('muda quando muda %s, mesmo sem versão nova', async (_, mudar) => {
    expect(await comContexto(mudar)).not.toBe(await etag())
  })

  it('a ordem das chaves de data não muda o ETag', async () => {
    const invertido = await comContexto((c) => ({
      ...c,
      certificate: {
        ...c.certificate,
        data: { turma: 'A', titulo_palestra: 'Git na prática' },
      },
    }))
    expect(invertido).toBe(await etag())
  })

  // Separador dentro de um valor não pode colar dois campos num só.
  it.each([',', '|', '\n'])('valores com %j no meio não se confundem', async (sep) => {
    const a = await comContexto((c) => ({
      ...c,
      event: { ...c.event, locationName: `A${sep}B`, city: 'C' },
    }))
    const b = await comContexto((c) => ({
      ...c,
      event: { ...c.event, locationName: 'A', city: `B${sep}C` },
    }))
    expect(a).not.toBe(b)
  })
})
