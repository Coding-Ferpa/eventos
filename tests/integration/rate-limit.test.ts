import { randomUUID } from 'node:crypto'

import { describe, expect, it } from 'vitest'

/**
 * Os baldes do doc 08 contra a `check_rate_limit` de verdade: cada teste usa
 * uma chave nova, então não depende do relógio nem dos outros testes.
 */

const { db } = await import('@/db/client')
const { consultarBalde, consumirBalde, LIMITES } = await import('@/lib/rate-limit')

describe('rate limit em baldes', () => {
  it('a 6ª busca do mesmo dispositivo no mesmo minuto é recusada, com o tempo de espera', async () => {
    const chave = `teste:${randomUUID()}`
    for (let i = 0; i < 5; i++) {
      expect(await consumirBalde(db(), chave, LIMITES.buscaPorDispositivo)).toEqual({
        permitido: true,
      })
    }
    const sexta = await consumirBalde(db(), chave, LIMITES.buscaPorDispositivo)
    expect(sexta).toMatchObject({ permitido: false })
    if (!sexta.permitido) {
      expect(sexta.esperarSegundos).toBeGreaterThan(0)
      expect(sexta.esperarSegundos).toBeLessThanOrEqual(60)
    }
  })

  it('consultar não gasta: é o balde de IP antes da busca', async () => {
    const chave = `teste:${randomUUID()}`
    for (let i = 0; i < 30; i++) await consultarBalde(db(), chave, LIMITES.buscaPorIp)
    expect(await consultarBalde(db(), chave, LIMITES.buscaPorIp)).toEqual({
      permitido: true,
    })
  })

  it('o balde de IP recusa a consulta quando as falhas do minuto acabaram', async () => {
    const chave = `teste:${randomUUID()}`
    for (let i = 0; i < 20; i++) await consumirBalde(db(), chave, LIMITES.buscaPorIp)
    expect(await consultarBalde(db(), chave, LIMITES.buscaPorIp)).toMatchObject({
      permitido: false,
    })
  })

  it('dispositivos diferentes não gastam a cota um do outro', async () => {
    const a = `teste:${randomUUID()}`
    const b = `teste:${randomUUID()}`
    for (let i = 0; i < 6; i++) await consumirBalde(db(), a, LIMITES.buscaPorDispositivo)
    expect(await consumirBalde(db(), b, LIMITES.buscaPorDispositivo)).toEqual({
      permitido: true,
    })
  })
})
