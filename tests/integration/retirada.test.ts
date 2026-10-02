import { randomUUID } from 'node:crypto'

import { and, eq } from 'drizzle-orm'
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type * as Email from '@/lib/email'
import type * as NextServer from 'next/server'

import { extrairTexto } from '../support/certificado'

/**
 * Retirada, download e pedido de correção pelos handlers de verdade, com um
 * modelo publicado e o base.pdf no Storage local (docs 05 e 07): E14, E15,
 * E16 e E19 no nível da integração, a falha do motor e o teste de projeção do
 * public-lookup (doc 08).
 */

const pendentes = vi.hoisted(() => [] as Promise<unknown>[])
vi.mock('next/server', async (original) => ({
  ...(await original<typeof NextServer>()),
  after: (tarefa: () => unknown) => {
    pendentes.push(Promise.resolve().then(tarefa))
  },
}))
const envios = vi.hoisted(() => [] as unknown[])
vi.mock('@/lib/email', async (original) => ({
  ...(await original<typeof Email>()),
  enviarEmail: async (mensagem: unknown) => {
    envios.push(mensagem)
    return 'enviado'
  },
}))

const { db } = await import('@/db/client')
const schema = await import('@/db/schema')
const {
  certificateDownloads,
  certificateTemplates,
  certificates,
  events,
  eventStatsDaily,
  nameCorrectionRequests,
  participants,
  participationTypes,
} = schema
const { POST: buscar } = await import('@/app/api/certificados/buscar/route')
const { GET: baixar } = await import('@/app/api/certificados/[codigo]/pdf/route')
const { POST: corrigir } = await import('@/app/api/certificados/[codigo]/correcao/route')
const lookup = await import('@/db/queries/public-lookup')
const { serverEnv } = await import('@/lib/env')
const { hmacCpf } = await import('@/lib/hmac')
const { criarCookieDeDispositivo } = await import('@/lib/cookies/device')
const { supabaseAdmin } = await import('@/lib/supabase/admin')
const { buildBasePdf } = await import('@/features/certificate/base-pdf')
const { arteDeExemplo, modeloDeExemplo } =
  await import('@/app/api/dev/certificado-exemplo/exemplo')

const env = serverEnv()
const SITE = 'http://localhost:3000'
let eventoId: string
let slug: string
let modeloId: string
let cookie: string
let palestra: string
let organizacao: string
let deOutraPessoa: string

async function esperarDepois() {
  await Promise.all(pendentes.splice(0))
}

// Cada execução tem o seu IP, e cada pedido o seu dispositivo: os baldes de
// download (10 por minuto) e de correção (5 por dia) valem de verdade aqui, e
// duas execuções seguidas os esgotariam.
const IP = `198.18.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
const identidade = () => ({
  'x-forwarded-for': IP,
  cookie: `${cookie}; cf-dispositivo=${criarCookieDeDispositivo(env.DEVICE_COOKIE_SECRET)}`,
})

const pedirPdf = (codigo: string, cabecalhos: Record<string, string> = {}) =>
  baixar(
    new NextRequest(`${SITE}/api/certificados/${codigo}/pdf`, {
      headers: { ...identidade(), ...cabecalhos },
    }),
    {
      params: Promise.resolve({ codigo }),
    },
  )

const pedirCorrecao = (codigo: string, corpo: Record<string, unknown>) =>
  corrigir(
    new NextRequest(`${SITE}/api/certificados/${codigo}/correcao`, {
      method: 'POST',
      headers: { ...identidade(), origin: SITE, 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ codigo }) },
  )

beforeAll(async () => {
  slug = `retirada-${randomUUID().slice(0, 8)}`
  const [evento] = await db()
    .insert(events)
    .values({
      slug,
      title: 'Ferpa Tech Day de Teste',
      city: 'Fernandópolis',
      startsAt: new Date('2026-09-12T11:00:00Z'),
      status: 'certificates_available',
      certificatesReleasedAt: new Date(),
      searchByCpf: true,
      contactEmail: 'organizacao@exemplo.org',
    })
    .returning({ id: events.id, salt: events.cpfSalt })
  eventoId = evento!.id

  // Um modelo publicado de verdade: o base.pdf vai para o bucket privado.
  const base = await buildBasePdf([await arteDeExemplo()])
  modeloId = randomUUID()
  const caminho = `${modeloId}/base.pdf`
  const { error } = await supabaseAdmin()
    .storage.from('templates')
    .upload(caminho, base.bytes, {
      contentType: 'application/pdf',
    })
  if (error) throw error
  await db()
    .insert(certificateTemplates)
    .values({
      id: modeloId,
      eventId: eventoId,
      name: 'Modelo da retirada',
      status: 'published',
      version: 1,
      publishedSnapshot: { ...modeloDeExemplo(base), base_pdf_path: caminho },
      publishedAt: new Date(),
    })
  const tipos = await db()
    .insert(participationTypes)
    .values([
      {
        eventId: eventoId,
        slug: 'palestrante',
        label: 'Palestrante',
        defaultHours: '2',
        certificateTemplateId: modeloId,
      },
      {
        eventId: eventoId,
        slug: 'organizador',
        label: 'Organizador',
        defaultHours: '8',
        certificateTemplateId: modeloId,
      },
    ])
    .returning({ id: participationTypes.id, slug: participationTypes.slug })
  const tipo = (s: string) => tipos.find((t) => t.slug === s)!.id

  const [jose, outra] = await db()
    .insert(participants)
    .values([
      {
        eventId: eventoId,
        fullName: 'José Gonçalves de Assunção',
        cpfHash: hmacCpf(env.CPF_PEPPER, evento!.salt, '52998224725'),
        cpfLast3: '725',
      },
      { eventId: eventoId, fullName: 'Outra Pessoa Qualquer' },
    ])
    .returning({ id: participants.id })
  const criados = await db()
    .insert(certificates)
    .values([
      {
        eventId: eventoId,
        participantId: jose!.id,
        participationTypeId: tipo('palestrante'),
        hours: '2',
        issuedAt: new Date(),
      },
      {
        eventId: eventoId,
        participantId: jose!.id,
        participationTypeId: tipo('organizador'),
        hours: '8',
        issuedAt: new Date(),
      },
      {
        eventId: eventoId,
        participantId: outra!.id,
        participationTypeId: tipo('palestrante'),
        hours: '2',
        issuedAt: new Date(),
      },
    ])
    .returning({
      code: certificates.code,
      participantId: certificates.participantId,
      hours: certificates.hours,
    })
  palestra = criados.find((c) => c.participantId === jose!.id && c.hours === '2.0')!.code
  organizacao = criados.find(
    (c) => c.participantId === jose!.id && c.hours === '8.0',
  )!.code
  deOutraPessoa = criados.find((c) => c.participantId === outra!.id)!.code

  const busca = await buscar(
    new NextRequest(`${SITE}/api/certificados/buscar`, {
      method: 'POST',
      headers: {
        origin: SITE,
        'content-type': 'application/json',
        'x-forwarded-for': IP,
      },
      body: JSON.stringify({ event_slug: slug, method: 'cpf', cpf: '529.982.247-25' }),
    }),
  )
  expect(busca.status).toBe(200)
  cookie = busca.headers.get('set-cookie')!.split(';')[0]!
})

afterAll(async () => {
  await db().delete(certificates).where(eq(certificates.eventId, eventoId))
  await db().delete(participants).where(eq(participants.eventId, eventoId))
  await db().delete(events).where(eq(events.id, eventoId))
  await supabaseAdmin()
    .storage.from('templates')
    .remove([`${modeloId}/base.pdf`])
})

const textoDoPdf = async (resposta: Response) =>
  (await extrairTexto(new Uint8Array(await resposta.arrayBuffer())))
    .flat()
    .map((trecho) => trecho.text)
    .join(' ')

describe('E14 e E15: retirada e download', () => {
  it('a tela de retirada tem os dois certificados da pessoa, e nada da outra', async () => {
    const pids = (
      await db()
        .select({ id: participants.id })
        .from(participants)
        .where(
          and(
            eq(participants.eventId, eventoId),
            eq(participants.fullName, 'José Gonçalves de Assunção'),
          ),
        )
    ).map((p) => p.id)
    const dados = await lookup.getRetrieval(slug, pids)
    expect(dados?.people).toHaveLength(1)
    expect(dados!.people[0]!.certificates.map((c) => [c.typeLabel, c.hours])).toEqual([
      ['Palestrante', 2],
      ['Organizador', 8],
    ])
  })

  it('baixa o PDF com o nome de arquivo certo e o nome acentuado no texto; If-None-Match dá 304', async () => {
    const resposta = await pedirPdf(palestra)
    expect(resposta.status).toBe(200)
    expect(resposta.headers.get('content-type')).toBe('application/pdf')
    expect(resposta.headers.get('content-disposition')).toContain(
      `filename="certificado-${slug}-jose.pdf"`,
    )
    expect(resposta.headers.get('cache-control')).toBe('private, no-cache')
    const etag = resposta.headers.get('etag')!
    const texto = await textoDoPdf(resposta)
    expect(texto).toContain('José Gonçalves de Assunção')
    expect(texto).toContain('2 horas')

    const deNovo = await pedirPdf(palestra, { 'if-none-match': etag })
    expect(deNovo.status).toBe(304)
  })

  it('o download fica registrado, com a origem e a versão', async () => {
    await pedirPdf(organizacao)
    await esperarDepois()
    const [certificado] = await db()
      .select()
      .from(certificates)
      .where(eq(certificates.code, organizacao))
    expect(certificado?.firstDownloadedAt).not.toBeNull()
    const registros = await db()
      .select({
        source: certificateDownloads.source,
        versao: certificateDownloads.certificateVersion,
      })
      .from(certificateDownloads)
      .where(eq(certificateDownloads.certificateId, certificado!.id))
    expect(registros).toEqual([{ source: 'search', versao: 1 }])
  })

  it('segundo certificado da mesma pessoa sai com a carga horária dele', async () => {
    expect(await textoDoPdf(await pedirPdf(organizacao))).toContain('8 horas')
  })

  it('código de outra pessoa, inexistente ou malformado: 404, tudo igual', async () => {
    const respostas = await Promise.all(
      [deOutraPessoa, 'ZZZZZZZZZZ', 'abc'].map((codigo) => pedirPdf(codigo)),
    )
    expect(respostas.map((r) => r.status)).toEqual([404, 404, 404])
    const corpos = await Promise.all(respostas.map((r) => r.json()))
    expect(new Set(corpos.map((c) => JSON.stringify(c))).size).toBe(1)
  })

  it('sem cookie: volta ao evento com o aviso de sessão expirada', async () => {
    const resposta = await baixar(
      new NextRequest(`${SITE}/api/certificados/${palestra}/pdf`, {
        headers: { 'x-forwarded-for': IP },
      }),
      {
        params: Promise.resolve({ codigo: palestra }),
      },
    )
    expect(resposta.status).toBe(303)
    expect(resposta.headers.get('location')).toBe(`/eventos/${slug}?sessao=expirada`)
  })
})

describe('E16: pedido de correção', () => {
  it('cria o pedido, avisa a organização e recusa o segundo com mensagem própria', async () => {
    const resposta = await pedirCorrecao(palestra, {
      requested_name: 'José Gonçalves Assunção',
      contact: 'jose@exemplo.org',
    })
    expect(resposta.status).toBe(201)
    await esperarDepois()
    expect(envios).toEqual([
      expect.objectContaining({
        para: 'organizacao@exemplo.org',
        assunto: 'Pedido de correção de nome: Ferpa Tech Day de Teste',
      }),
    ])

    const [pedido] = await db()
      .select()
      .from(nameCorrectionRequests)
      .innerJoin(certificates, eq(certificates.id, nameCorrectionRequests.certificateId))
      .where(eq(certificates.code, palestra))
    expect(pedido?.name_correction_requests).toMatchObject({
      currentName: 'José Gonçalves de Assunção',
      status: 'pending',
    })

    const segundo = await pedirCorrecao(palestra, {
      requested_name: 'Outro Nome Qualquer',
      contact: 'jose@exemplo.org',
    })
    expect(segundo.status).toBe(409)
    expect(await segundo.json()).toMatchObject({ code: 'correction_already_pending' })
  })

  it('não corrige certificado de outra pessoa', async () => {
    expect(
      (
        await pedirCorrecao(deOutraPessoa, {
          requested_name: 'Nome Novo Aqui',
          contact: 'x@exemplo.org',
        })
      ).status,
    ).toBe(404)
  })
})

describe('E19 e falha do motor', () => {
  it('revogado responde 410 no download', async () => {
    await db()
      .update(certificates)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedReason: 'Revogado no teste da retirada',
      })
      .where(eq(certificates.code, organizacao))
    expect((await pedirPdf(organizacao)).status).toBe(410)
    await db()
      .update(certificates)
      .set({ status: 'active', revokedAt: null, revokedReason: null })
      .where(eq(certificates.code, organizacao))
  })

  it('falha do motor volta à tela com o aviso e soma em pdf_failures', async () => {
    const [modelo] = await db()
      .select({ snapshot: certificateTemplates.publishedSnapshot })
      .from(certificateTemplates)
      .where(eq(certificateTemplates.id, modeloId))
    const original = modelo!.snapshot as Record<string, unknown>
    // Outro sha256 tira o base.pdf do cache; o caminho não existe no bucket.
    await db()
      .update(certificateTemplates)
      .set({
        publishedSnapshot: {
          ...original,
          base_pdf_path: `${modeloId}/sumiu.pdf`,
          base_pdf_sha256: 'f'.repeat(64),
        },
      })
      .where(eq(certificateTemplates.id, modeloId))
    try {
      const resposta = await pedirPdf(palestra)
      expect(resposta.status).toBe(303)
      expect(resposta.headers.get('location')).toBe(
        `/eventos/${slug}/certificado?erro=geracao`,
      )
      await esperarDepois()
      const [dia] = await db()
        .select({ falhas: eventStatsDaily.pdfFailures })
        .from(eventStatsDaily)
        .where(eq(eventStatsDaily.eventId, eventoId))
      expect(dia?.falhas).toBe(1)
    } finally {
      await db()
        .update(certificateTemplates)
        .set({ publishedSnapshot: original })
        .where(eq(certificateTemplates.id, modeloId))
    }
  })
})

describe('projeção do public-lookup (doc 08)', () => {
  const PROIBIDAS = new Set([
    'id',
    'participant_id',
    'participantId',
    'cpf_hash',
    'cpfHash',
    'email',
    'birth_date',
    'birthDate',
  ])

  function chaves(valor: unknown, caminho = ''): string[] {
    if (Array.isArray(valor))
      return valor.flatMap((item, i) => chaves(item, `${caminho}[${i}]`))
    if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
      return Object.entries(valor).flatMap(([chave, dentro]) => [
        `${caminho}.${chave}`,
        // O snapshot é o modelo, e não pessoa: o `id` dos campos dele é o nome
        // que o editor dá à caixa ("nome", "qr"), não um id de banco.
        ...(chave === 'snapshot' ? [] : chaves(dentro, `${caminho}.${chave}`)),
      ])
    }
    return []
  }
  const proibidas = (valor: unknown) =>
    chaves(valor).filter((c) =>
      PROIBIDAS.has(
        c
          .split('.')
          .pop()!
          .replace(/\[\d+\]$/, ''),
      ),
    )

  it('nenhum retorno traz id interno, CPF em hash, e-mail ou nascimento', async () => {
    const pids = (
      await db()
        .select({ id: participants.id })
        .from(participants)
        .where(eq(participants.eventId, eventoId))
    ).map((p) => p.id)
    const retornos = [
      await db().transaction((tx) => lookup.getEventForSearch(tx, slug)),
      await db().transaction((tx) =>
        lookup.findParticipant(tx, eventoId, { fullName: 'José Gonçalves de Assunção' }),
      ),
      await lookup.getRetrieval(slug, pids),
      await lookup.getCertificateForDownload(palestra, pids),
      await lookup.getCertificateForDownload(deOutraPessoa, []),
    ]
    for (const retorno of retornos) expect(proibidas(retorno)).toEqual([])
  })

  it('o teste de projeção morde: um retorno com id é acusado, fora do snapshot', () => {
    expect(
      proibidas({
        people: [
          {
            id: 'x',
            certificates: [{ email: 'y', snapshot: { layout_fields: [{ id: 'nome' }] } }],
          },
        ],
      }),
    ).toEqual(['.people[0].id', '.people[0].certificates[0].email'])
  })
})
