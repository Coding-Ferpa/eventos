// @vitest-environment node

import { randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { abrirRetirada, selarRetirada } from './retrieval'

const CHAVE = randomBytes(32)
const PID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const AGORA = new Date('2026-10-02T12:00:00Z')

describe('cookie de retirada (ADR-0010)', () => {
  it('fecha e abre: pids, origem e validade de 30 minutos', () => {
    const valor = selarRetirada(CHAVE, { pids: [PID], src: 'search_cpf' }, AGORA)
    expect(abrirRetirada(valor, CHAVE, AGORA)).toEqual({
      pids: [PID],
      src: 'search_cpf',
      exp: AGORA.getTime() / 1000 + 30 * 60,
    })
  })

  it('opaco de verdade: o id não aparece nem decodificando o base64', () => {
    const valor = selarRetirada(CHAVE, { pids: [PID], src: 'search_name' }, AGORA)
    expect(valor).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    const bytes = Buffer.concat(
      valor
        .split('.')
        .slice(1)
        .map((parte) => Buffer.from(parte, 'base64url')),
    )
    expect(bytes.toString('latin1')).not.toContain(PID)
    expect(bytes.toString('latin1')).not.toContain('search_name')
  })

  it('cada emissão tem um IV novo', () => {
    const a = selarRetirada(CHAVE, { pids: [PID], src: 'search_cpf' }, AGORA)
    const b = selarRetirada(CHAVE, { pids: [PID], src: 'search_cpf' }, AGORA)
    expect(a).not.toBe(b)
  })

  it('venceu, não abre', () => {
    const valor = selarRetirada(CHAVE, { pids: [PID], src: 'search_cpf' }, AGORA)
    const depois = new Date(AGORA.getTime() + 30 * 60 * 1000 + 1000)
    expect(abrirRetirada(valor, CHAVE, depois)).toBeNull()
  })

  it('adulterado, com outra chave ou malformado, não abre', () => {
    const valor = selarRetirada(CHAVE, { pids: [PID], src: 'search_cpf' }, AGORA)
    const [versao, iv, cifra] = valor.split('.') as [string, string, string]
    const trocado = Buffer.from(cifra, 'base64url')
    trocado[0] = trocado[0]! ^ 1
    expect(
      abrirRetirada(`${versao}.${iv}.${trocado.toString('base64url')}`, CHAVE, AGORA),
    ).toBeNull()
    expect(abrirRetirada(valor, randomBytes(32), AGORA)).toBeNull()
    for (const ruim of [undefined, '', 'v1', 'v2.a.b', 'v1.!!.??', `v1.${iv}`]) {
      expect(abrirRetirada(ruim, CHAVE, AGORA)).toBeNull()
    }
  })

  it('no máximo 40 pessoas, para "meus certificados" não mudar o formato', () => {
    const muitos = Array.from({ length: 41 }, () => PID)
    expect(() => selarRetirada(CHAVE, { pids: muitos, src: 'mine' }, AGORA)).toThrow()
  })
})
