// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { extrairTexto } from '../../../../../tests/support/certificado'
import { GET } from './route'

vi.mock('server-only', () => ({}))

const URL_DA_ROTA = 'https://preview.example/api/dev/certificado-exemplo'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://eventos.codingferpa.org')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function textoDasPaginas(paginas: Awaited<ReturnType<typeof extrairTexto>>) {
  return paginas.flat().map((trecho) => trecho.text)
}

describe('GET /api/dev/certificado-exemplo', () => {
  it('fora da produção, devolve um PDF para baixar com o nome acentuado', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const resposta = await GET(new Request(URL_DA_ROTA))

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get('content-type')).toBe('application/pdf')
    expect(resposta.headers.get('content-disposition')).toMatch(/^attachment; filename=/)
    expect(resposta.headers.get('cache-control')).toBe('no-store')
    expect(resposta.headers.get('x-robots-tag')).toBe('noindex')

    const pdf = new Uint8Array(await resposta.arrayBuffer())
    expect(textoDasPaginas(await extrairTexto(pdf))).toContain(
      'José Gonçalves de Assunção',
    )
  })

  it('aceita outro nome pela query, para testar nome longo', async () => {
    const nome = 'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues de Conceição'
    const resposta = await GET(
      new Request(`${URL_DA_ROTA}?nome=${encodeURIComponent(nome)}`),
    )
    const linhas = textoDasPaginas(
      await extrairTexto(new Uint8Array(await resposta.arrayBuffer())),
    )

    expect(linhas.join(' ')).toContain('Maria Eduarda dos Santos')
    expect(linhas.join(' ')).toContain('de Conceição')
  })

  it('nome acima de 120 caracteres é 400, não PDF', async () => {
    const resposta = await GET(new Request(`${URL_DA_ROTA}?nome=${'a'.repeat(121)}`))
    expect(resposta.status).toBe(400)
  })

  it('em produção, a rota não existe', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    const resposta = await GET(new Request(URL_DA_ROTA))
    expect(resposta.status).toBe(404)
    expect(resposta.headers.get('content-type')).not.toBe('application/pdf')
  })
})
