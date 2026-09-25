// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { logger } from './logger'

afterEach(() => {
  vi.restoreAllMocks()
})

function linhaDe(espiao: { mock: { calls: unknown[][] } }) {
  return JSON.parse(String(espiao.mock.calls[0]?.[0])) as Record<string, unknown>
}

describe('logger (doc 10)', () => {
  it('escreve uma linha de JSON com nível, hora e os campos permitidos', () => {
    const espiao = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.info({ event: 'pdf.generated', duration_ms: 120, certificate_id: 'c1' })

    expect(linhaDe(espiao)).toMatchObject({
      level: 'info',
      event: 'pdf.generated',
      duration_ms: 120,
      certificate_id: 'c1',
    })
    expect(linhaDe(espiao).time).toEqual(expect.any(String))
  })

  it('descarta todo campo fora da lista branca: não dá para logar um nome', () => {
    const espiao = vi.spyOn(console, 'log').mockImplementation(() => {})

    // O tipo já recusa; o cast simula o descuido que passaria pelo tipo.
    logger.info({
      event: 'search.done',
      nome: 'Maria da Silva',
      cpf: '12345678909',
    } as unknown as Parameters<typeof logger.info>[0])

    const linha = linhaDe(espiao)
    expect(linha).toEqual({
      level: 'info',
      time: expect.any(String),
      event: 'search.done',
    })
    expect(JSON.stringify(linha)).not.toMatch(/Maria|12345678909/)
  })

  it('manda aviso e erro para os canais certos', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.warn({ event: 'visit.failed' })
    logger.error({ event: 'pdf.failed', template_id: 't1' })

    expect(linhaDe(aviso)).toMatchObject({ level: 'warn', event: 'visit.failed' })
    expect(linhaDe(erro)).toMatchObject({ level: 'error', template_id: 't1' })
  })
})
