import { randomUUID } from 'node:crypto'

import { eq, inArray } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * `POST /api/certificados/buscar` pelo handler de verdade, contra o banco
 * local (doc 07, doc 08): E11, E12 e E13 no nível da integração.
 */

const { db } = await import('@/db/client')
const { events, participants, searchAttempts } = await import('@/db/schema')
const { POST } = await import('@/app/api/certificados/buscar/route')
const { serverEnv } = await import('@/lib/env')
const { hmacCpf } = await import('@/lib/hmac')
const { abrirRetirada } = await import('@/lib/cookies/retrieval')
const { criarCookieDeDispositivo } = await import('@/lib/cookies/device')

const env = serverEnv()
const criados: string[] = []
let slug: string
let mariaId: string

type Evento = {
  byCpf?: boolean
  byEmail?: boolean
  byName?: boolean
  birthDate?: boolean
  mode?: 'any' | 'all'
  status?: 'certificates_available' | 'completed'
}

async function novoEvento(config: Evento = {}) {
  const novoSlug = `busca-${randomUUID().slice(0, 8)}`
  const [evento] = await db()
    .insert(events)
    .values({
      slug: novoSlug,
      title: 'Evento da busca',
      startsAt: new Date('2026-09-12T11:00:00Z'),
      status: config.status ?? 'certificates_available',
      searchByCpf: config.byCpf ?? true,
      searchByEmail: config.byEmail ?? true,
      searchByName: config.byName ?? true,
      searchBirthDate: config.birthDate ?? false,
      searchMode: config.mode ?? 'any',
    })
    .returning({ id: events.id, salt: events.cpfSalt })
  criados.push(evento!.id)
  return { id: evento!.id, slug: novoSlug, salt: evento!.salt }
}

const dispositivo = () =>
  `cf-dispositivo=${criarCookieDeDispositivo(env.DEVICE_COOKIE_SECRET)}`

function buscar(
  corpo: Record<string, unknown>,
  opcoes: {
    ip?: string
    cookie?: string
    origin?: string | null
    url?: string
    host?: string
  } = {},
) {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': opcoes.ip ?? '203.0.113.10',
  }
  if (opcoes.origin !== null) headers.origin = opcoes.origin ?? 'http://localhost:3000'
  // Como a Vercel entrega o host que a pessoa abriu.
  if (opcoes.host !== undefined) headers['x-forwarded-host'] = opcoes.host
  if (opcoes.cookie !== undefined) headers.cookie = opcoes.cookie
  return POST(
    new NextRequest(opcoes.url ?? 'http://localhost:3000/api/certificados/buscar', {
      method: 'POST',
      headers,
      body: JSON.stringify({ event_slug: slug, ...corpo }),
    }),
  )
}

beforeAll(async () => {
  const evento = await novoEvento()
  slug = evento.slug
  const inseridos = await db()
    .insert(participants)
    .values([
      {
        eventId: evento.id,
        fullName: 'Maria Eduarda dos Santos',
        cpfHash: hmacCpf(env.CPF_PEPPER, evento.salt, '52998224725'),
        cpfLast3: '725',
        email: 'maria@exemplo.org',
      },
      { eventId: evento.id, fullName: 'Ana Lima', email: 'ana1@exemplo.org' },
      { eventId: evento.id, fullName: 'Ana Lima', email: 'ana2@exemplo.org' },
    ])
    .returning({ id: participants.id, nome: participants.fullName })
  mariaId = inseridos.find((p) => p.nome.startsWith('Maria'))!.id
})

afterAll(async () => {
  await db().delete(participants).where(inArray(participants.eventId, criados))
  await db().delete(events).where(inArray(events.id, criados))
})

describe('E11: busca por nome', () => {
  it('em https, como em produção, o cookie de retirada leva Secure', async () => {
    const resposta = await buscar(
      { method: 'name', full_name: 'MARIA EDUARDA SANTOS' },
      {
        cookie: dispositivo(),
        url: 'https://eventos.codingferpa.org/api/certificados/buscar',
      },
    )
    expect(resposta.status).toBe(200)
    expect(resposta.headers.get('set-cookie')).toMatch(
      /; HttpOnly; Secure; SameSite=Lax$/,
    )
  })

  it('"maria" não encontra; "MARIA EDUARDA SANTOS" encontra "Maria Eduarda dos Santos"', async () => {
    const parcial = await buscar(
      { method: 'name', full_name: 'maria' },
      { cookie: dispositivo() },
    )
    expect(parcial.status).toBe(404)

    const resposta = await buscar(
      { method: 'name', full_name: 'MARIA EDUARDA SANTOS' },
      { cookie: dispositivo() },
    )
    expect(resposta.status).toBe(200)
    const corpo = await resposta.json()
    expect(corpo).toEqual({ ok: true, redirect: `/eventos/${slug}/certificado` })
    expect(JSON.stringify(corpo)).not.toMatch(/maria|[0-9a-f]{8}-[0-9a-f]{4}/i)

    const cookie = resposta.headers.get('set-cookie')!
    // Em http://localhost vai sem Secure (o WebKit não o devolveria); o
    // teste seguinte prova que em https ele vai.
    expect(cookie).toMatch(
      /^cf-retirada=v1\.[^;]+; Max-Age=1800; Path=\/; HttpOnly; SameSite=Lax$/,
    )
    const valor = cookie.split(';')[0]!.slice('cf-retirada='.length)
    expect(
      abrirRetirada(valor, Buffer.from(env.RETRIEVAL_COOKIE_KEY, 'base64')),
    ).toMatchObject({
      pids: [mariaId],
      src: 'search_name',
    })
  })

  it('homônimos respondem exatamente como não encontrado, e só o log sabe a diferença', async () => {
    const ambiguo = await buscar(
      { method: 'name', full_name: 'Ana Lima' },
      { cookie: dispositivo() },
    )
    const ninguem = await buscar(
      { method: 'name', full_name: 'Pessoa Que Nao Existe' },
      { cookie: dispositivo() },
    )
    expect(ambiguo.status).toBe(404)
    expect(await ambiguo.json()).toEqual(await ninguem.json())
    const desfechos = await db()
      .select({ outcome: searchAttempts.outcome })
      .from(searchAttempts)
      .where(inArray(searchAttempts.eventId, criados))
    expect(desfechos.map((d) => d.outcome)).toContain('ambiguous')
  })
})

describe('E12: busca por CPF e por e-mail', () => {
  it.each(['529.982.247-25', '52998224725'])('CPF %s encontra', async (cpf) => {
    expect((await buscar({ method: 'cpf', cpf }, { cookie: dispositivo() })).status).toBe(
      200,
    )
  })

  it('CPF com dígito errado é erro de validação, e não "não encontrado"', async () => {
    const resposta = await buscar(
      { method: 'cpf', cpf: '529.982.247-24' },
      { cookie: dispositivo() },
    )
    expect(resposta.status).toBe(422)
    expect(await resposta.json()).toMatchObject({
      code: 'validation_error',
      field_errors: { cpf: expect.any(Array) },
    })
  })

  it('e-mail sem diferenciar maiúsculas', async () => {
    expect(
      (
        await buscar(
          { method: 'email', email: 'Maria@Exemplo.ORG' },
          { cookie: dispositivo() },
        )
      ).status,
    ).toBe(200)
  })
})

describe('E13: rate limit em dois baldes', () => {
  it('a 6ª tentativa do mesmo dispositivo no minuto recebe 429 em pt-BR; outro dispositivo no mesmo IP continua', async () => {
    const meu = dispositivo()
    const ip = `198.51.100.${Math.floor(Math.random() * 200)}`
    for (let i = 0; i < 5; i++)
      await buscar({ method: 'name', full_name: 'Ninguém Aqui' }, { cookie: meu, ip })
    const sexta = await buscar(
      { method: 'name', full_name: 'Ninguém Aqui' },
      { cookie: meu, ip },
    )
    expect(sexta.status).toBe(429)
    expect(Number(sexta.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await sexta.json()).detail).toMatch(
      /^Muitas tentativas seguidas\. Você pode tentar de novo em \d+ segundos?\.$/,
    )

    const outro = await buscar(
      { method: 'name', full_name: 'MARIA EDUARDA SANTOS' },
      { cookie: dispositivo(), ip },
    )
    expect(outro.status).toBe(200)
  })

  it('o balde de IP conta só falhas: 20 no minuto fecham o IP para todos', async () => {
    const ip = `192.0.2.${Math.floor(Math.random() * 200)}`
    for (let i = 0; i < 20; i++) {
      await buscar(
        { method: 'name', full_name: 'Ninguém Aqui' },
        { cookie: dispositivo(), ip },
      )
    }
    expect(
      (
        await buscar(
          { method: 'name', full_name: 'MARIA EDUARDA SANTOS' },
          { cookie: dispositivo(), ip },
        )
      ).status,
    ).toBe(429)
  })
})

describe('as outras portas fechadas', () => {
  it('sem o Origin do site: 403', async () => {
    expect(
      (await buscar({ method: 'cpf', cpf: '52998224725' }, { origin: null })).status,
    ).toBe(403)
    expect(
      (
        await buscar(
          { method: 'cpf', cpf: '52998224725' },
          { origin: 'https://outro.site' },
        )
      ).status,
    ).toBe(403)
  })

  it('pelo outro endereço do próprio site (o vercel.app) a busca funciona', async () => {
    const vercel = 'https://eventos-chi-eight.vercel.app'
    const aceita = await buscar(
      { method: 'cpf', cpf: '52998224725' },
      { origin: vercel, host: 'eventos-chi-eight.vercel.app', ip: '203.0.113.61' },
    )
    expect(aceita.status).not.toBe(403)
    // A mesma origem, com o pedido chegando por outro host, continua de fora.
    const recusa = await buscar(
      { method: 'cpf', cpf: '52998224725' },
      { origin: vercel, host: 'eventos.codingferpa.org', ip: '203.0.113.62' },
    )
    expect(recusa.status).toBe(403)
    // E outro projeto do vercel.app nunca passa.
    const golpe = await buscar(
      { method: 'cpf', cpf: '52998224725' },
      {
        origin: 'https://golpe.vercel.app',
        host: 'eventos-chi-eight.vercel.app',
        ip: '203.0.113.63',
      },
    )
    expect(golpe.status).toBe(403)
  })

  it('evento que não liberou os certificados responde como inexistente', async () => {
    const fechado = await novoEvento({ status: 'completed' })
    const resposta = await POST(
      new NextRequest('http://localhost:3000/api/certificados/buscar', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
        body: JSON.stringify({
          event_slug: fechado.slug,
          method: 'cpf',
          cpf: '52998224725',
        }),
      }),
    )
    expect(resposta.status).toBe(409)
    expect(await resposta.json()).toMatchObject({ code: 'event_unavailable' })
  })

  it('método desligado no evento é erro de validação', async () => {
    const original = slug
    const soNome = await novoEvento({ byCpf: false, byEmail: false })
    slug = soNome.slug
    try {
      expect(
        (await buscar({ method: 'cpf', cpf: '52998224725' }, { cookie: dispositivo() }))
          .status,
      ).toBe(422)
    } finally {
      slug = original
    }
  })

  it('com nascimento ligado, o nome sozinho não basta (ADR-0009)', async () => {
    const original = slug
    const comData = await novoEvento({ birthDate: true })
    slug = comData.slug
    try {
      const resposta = await buscar(
        { method: 'name', full_name: 'Maria Eduarda dos Santos' },
        { cookie: dispositivo() },
      )
      expect(resposta.status).toBe(422)
      expect(await resposta.json()).toMatchObject({
        field_errors: { birth_date: expect.any(Array) },
      })
    } finally {
      slug = original
    }
  })

  it('o log não guarda o valor buscado: só método, desfecho e os HMACs', async () => {
    const colunas = Object.keys(
      (
        await db()
          .select()
          .from(searchAttempts)
          .where(eq(searchAttempts.eventId, criados[0]!))
          .limit(1)
      )[0] ?? {},
    )
    expect(colunas.sort()).toEqual([
      'deviceHash',
      'eventId',
      'id',
      'ipHash',
      'method',
      'occurredAt',
      'outcome',
    ])
  })
})
