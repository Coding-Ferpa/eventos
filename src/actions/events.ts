'use server'

import { randomUUID } from 'node:crypto'

import { and, count, eq, isNull, ne, or, sql } from 'drizzle-orm'

import type { Transaction } from '@/db/client'
import {
  certificates,
  certificateTemplates,
  events,
  participationTypes,
} from '@/db/schema'
import { supabaseEnv } from '@/lib/env'
import { tipoDeImagemPelosBytes } from '@/lib/image-signature'
import {
  atualizacaoDeEventoSchema,
  novoEventoSchema,
  pendenciasDaLiberacao,
  problemaNaTransicao,
  problemasDaBusca,
  STATUS_DO_EVENTO,
  TIPOS_PADRAO,
} from '@/lib/schemas/event'
import { gerarSlug } from '@/lib/slug'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { z } from '@/lib/zod'

import { defineAction, FalhaDaAction } from './define-action'

/**
 * Actions de evento (doc 07). Todas pelo `defineAction`: sessão, Zod, papel,
 * operação e auditoria na mesma transação, e o cache derrubado depois do
 * commit. A tag `events` derruba o catálogo e o sitemap; `event:{slug}`, a
 * página do evento, a capa gerada e o cartão de compartilhamento.
 */

function campoInvalido(campo: string, mensagem: string): never {
  throw new FalhaDaAction('validation_error', 'Confira os campos destacados.', {
    [campo]: [mensagem],
  })
}

async function exigirSlugLivre(tx: Transaction, slug: string, exceto?: string) {
  const [ocupado] = await tx
    .select({ id: events.id })
    .from(events)
    .where(
      exceto ? and(eq(events.slug, slug), ne(events.id, exceto)) : eq(events.slug, slug),
    )
    .limit(1)

  if (ocupado) {
    throw new FalhaDaAction('conflict', 'Já existe um evento com esse endereço.', {
      slug: ['Já existe um evento com esse endereço. Escolha outro.'],
    })
  }
}

/** Trava a linha até o fim da transação: duas edições não se atropelam. */
async function eventoParaAlterar(tx: Transaction, id: string) {
  const [evento] = await tx.select().from(events).where(eq(events.id, id)).for('update')
  if (!evento) throw new FalhaDaAction('not_found', 'Não encontramos esse evento.')
  return evento
}

export const createEvent = defineAction({
  nome: 'event.create',
  entidade: 'events',
  papelMinimo: 'editor',
  schema: novoEventoSchema,
  async executar({ entrada, usuario, tx }) {
    const slug = entrada.slug ?? gerarSlug(entrada.title)
    if (slug.length < 3) {
      campoInvalido(
        'slug',
        'O título não rende um endereço: escolha um, com pelo menos 3 letras.',
      )
    }
    await exigirSlugLivre(tx, slug)

    // Nasce em rascunho, e o `cpf_salt` é o padrão da coluna (doc 04).
    const [evento] = await tx
      .insert(events)
      .values({
        slug,
        title: entrada.title,
        descriptionMd: entrada.descriptionMd,
        startsAt: entrada.startsAt,
        endsAt: entrada.endsAt ?? null,
        locationName: entrada.locationName ?? null,
        city: entrada.city ?? null,
        state: entrada.state ?? null,
        externalUrl: entrada.externalUrl ?? null,
        contactEmail: entrada.contactEmail ?? null,
        contactUrl: entrada.contactUrl ?? null,
        createdBy: usuario.id,
      })
      .returning({ id: events.id, slug: events.slug })
    if (!evento) throw new Error('O insert do evento não devolveu a linha.')

    // Na mesma transação, e não por trigger: o admin pode apagar os que não usa.
    await tx.insert(participationTypes).values(
      TIPOS_PADRAO.map((tipo) => ({
        eventId: evento.id,
        slug: tipo.slug,
        label: tipo.label,
        aliases: [...tipo.aliases],
        defaultHours: tipo.defaultHours,
        sortOrder: tipo.sortOrder,
      })),
    )

    return {
      data: evento,
      entityId: evento.id,
      diff: { slug: evento.slug, title: entrada.title, tiposPadrao: TIPOS_PADRAO.length },
    }
  },
  revalidar: ['events'],
})

/** O que mudou, em pares [antes, depois]. A descrição entra só como "mudou". */
function diffDe(antes: Record<string, unknown>, depois: Record<string, unknown>) {
  const diff: Record<string, unknown> = {}
  for (const [campo, valor] of Object.entries(depois)) {
    const anterior = antes[campo]
    const igual =
      anterior instanceof Date && valor instanceof Date
        ? anterior.getTime() === valor.getTime()
        : anterior === valor
    if (igual) continue
    diff[campo] =
      campo === 'descriptionMd' ? 'alterada' : [anterior ?? null, valor ?? null]
  }
  return diff
}

/**
 * A capa enviada tem de ser imagem de verdade: confere os primeiros bytes, e
 * não o `Content-Type` que o navegador declarou (migration 0012).
 */
async function conferirCapa(caminho: string) {
  const base = supabaseEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
  const resposta = await fetch(`${base}/storage/v1/object/public/covers/${caminho}`, {
    headers: { range: 'bytes=0-15' },
    cache: 'no-store',
  })
  if (!resposta.ok) {
    throw new FalhaDaAction(
      'not_found',
      'A capa não chegou ao armazenamento. Envie de novo.',
    )
  }

  const tipo = tipoDeImagemPelosBytes(new Uint8Array(await resposta.arrayBuffer()))
  const extensao = caminho.split('.').pop()
  if (!tipo || tipo !== extensao) {
    await supabaseAdmin().storage.from('covers').remove([caminho])
    campoInvalido('coverPath', 'A capa precisa ser uma imagem JPEG, PNG ou WebP.')
  }
}

export const updateEvent = defineAction({
  nome: 'event.update',
  entidade: 'events',
  papelMinimo: 'editor',
  schema: atualizacaoDeEventoSchema,
  async executar({ entrada, tx }) {
    const { id, ...mudanca } = entrada
    const atual = await eventoParaAlterar(tx, id)

    if (mudanca.slug === null) campoInvalido('slug', 'Informe o endereço do evento.')
    if (mudanca.slug !== undefined && mudanca.slug !== atual.slug) {
      // O trigger do banco também recusa; aqui a recusa vira mensagem no campo.
      if (atual.status !== 'draft') {
        throw new FalhaDaAction(
          'slug_locked',
          'O endereço não muda depois que o evento sai do rascunho.',
          { slug: ['Ele já pode estar em cartaz, em QR ou em link de grupo.'] },
        )
      }
      await exigirSlugLivre(tx, mudanca.slug, id)
    }

    const inicio = mudanca.startsAt ?? atual.startsAt
    const fim = mudanca.endsAt === undefined ? atual.endsAt : mudanca.endsAt
    if (fim && fim < inicio)
      campoInvalido('endsAt', 'O término não pode ser antes do início.')

    const problemas = problemasDaBusca(
      {
        searchByCpf: mudanca.searchByCpf ?? atual.searchByCpf,
        searchByEmail: mudanca.searchByEmail ?? atual.searchByEmail,
        searchByName: mudanca.searchByName ?? atual.searchByName,
        searchBirthDate: mudanca.searchBirthDate ?? atual.searchBirthDate,
        searchMode: mudanca.searchMode ?? atual.searchMode,
      },
      atual.status,
    )
    if (Object.keys(problemas).length > 0) {
      throw new FalhaDaAction(
        'validation_error',
        'Confira a configuração da busca.',
        problemas,
      )
    }

    if (mudanca.coverPath) await conferirCapa(mudanca.coverPath)

    const valores = Object.fromEntries(
      Object.entries(mudanca).filter(([, valor]) => valor !== undefined),
    )
    if (Object.keys(valores).length > 0) {
      await tx.update(events).set(valores).where(eq(events.id, id))
    }

    const slug = mudanca.slug ?? atual.slug
    return {
      data: { slug },
      entityId: id,
      diff: diffDe(atual, valores),
      tags: [...new Set([`event:${atual.slug}`, `event:${slug}`])],
    }
  },
  revalidar: ['events'],
})

export const setEventStatus = defineAction({
  nome: 'event.set_status',
  entidade: 'events',
  papelMinimo: 'editor',
  schema: z.object({ id: z.uuid(), status: z.enum(STATUS_DO_EVENTO) }),
  async executar({ entrada, tx }) {
    const atual = await eventoParaAlterar(tx, entrada.id)

    const problema = problemaNaTransicao(atual.status, entrada.status)
    if (problema) throw new FalhaDaAction('conflict', problema, { status: [problema] })

    await tx
      .update(events)
      .set({ status: entrada.status })
      .where(eq(events.id, entrada.id))

    return {
      data: { status: entrada.status },
      entityId: entrada.id,
      diff: { status: [atual.status, entrada.status] },
      tags: [`event:${atual.slug}`],
    }
  },
  revalidar: ['events'],
})

export const releaseCertificates = defineAction({
  nome: 'event.release_certificates',
  entidade: 'events',
  papelMinimo: 'editor',
  schema: z.object({ id: z.uuid() }),
  async executar({ entrada, tx }) {
    const atual = await eventoParaAlterar(tx, entrada.id)
    // Liberar de novo mudaria a data da liberação, que o resumo e o
    // `issued_at` dos novos certificados usam.
    if (atual.status === 'certificates_available')
      throw new FalhaDaAction('conflict', 'Os certificados deste evento já estão no ar.')

    const ativos = and(
      eq(certificates.eventId, entrada.id),
      eq(certificates.status, 'active'),
    )
    const [contagem] = await tx
      .select({ total: count() })
      .from(certificates)
      .where(ativos)
    const semModelo = await tx
      .selectDistinct({
        label: participationTypes.label,
        ordem: participationTypes.sortOrder,
      })
      .from(certificates)
      .innerJoin(
        participationTypes,
        eq(participationTypes.id, certificates.participationTypeId),
      )
      .leftJoin(
        certificateTemplates,
        eq(certificateTemplates.id, participationTypes.certificateTemplateId),
      )
      .where(
        and(
          ativos,
          or(
            isNull(certificateTemplates.id),
            ne(certificateTemplates.status, 'published'),
          ),
        ),
      )
      .orderBy(participationTypes.sortOrder)

    const pendencias = pendenciasDaLiberacao({
      certificadosAtivos: contagem?.total ?? 0,
      tiposSemModeloPublicado: semModelo.map((tipo) => tipo.label),
      busca: atual,
    })
    if (pendencias.length > 0) {
      throw new FalhaDaAction(
        'release_preconditions_failed',
        'Ainda não dá para liberar os certificados.',
        { liberar: pendencias },
      )
    }

    await tx
      .update(events)
      .set({ status: 'certificates_available', certificatesReleasedAt: sql`now()` })
      .where(eq(events.id, entrada.id))
    const emitidos = await tx
      .update(certificates)
      .set({ issuedAt: sql`now()` })
      .where(and(eq(certificates.eventId, entrada.id), isNull(certificates.issuedAt)))
      .returning({ id: certificates.id })

    return {
      data: { emitidos: emitidos.length },
      entityId: entrada.id,
      diff: {
        status: [atual.status, 'certificates_available'],
        emitidos: emitidos.length,
      },
      tags: [`event:${atual.slug}`],
    }
  },
  revalidar: ['events'],
})

export const deleteEvent = defineAction({
  nome: 'event.delete',
  entidade: 'events',
  papelMinimo: 'admin',
  schema: z.object({ id: z.uuid() }),
  async executar({ entrada, tx }) {
    const atual = await eventoParaAlterar(tx, entrada.id)

    if (atual.status !== 'draft') {
      throw new FalhaDaAction(
        'conflict',
        'Só dá para apagar um evento em rascunho. Para tirá-lo do catálogo, arquive.',
      )
    }

    const [emitidos] = await tx
      .select({ total: count() })
      .from(certificates)
      .where(eq(certificates.eventId, entrada.id))
    if ((emitidos?.total ?? 0) > 0) {
      throw new FalhaDaAction(
        'conflict',
        'Este evento já tem certificados. Remova-os antes de apagar o evento.',
      )
    }

    // Os tipos e os modelos caem junto, pelo cascade do banco.
    await tx.delete(events).where(eq(events.id, entrada.id))

    return {
      data: null,
      entityId: entrada.id,
      diff: { slug: atual.slug, title: atual.title },
    }
  },
  revalidar: ['events'],
})

const EXTENSAO = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

/**
 * URL assinada para o navegador subir a capa direto ao Storage (doc 04): o
 * arquivo não passa pela função, que na Vercel aceita no máximo 4,5 MB de
 * corpo. O nome é aleatório e único, e por isso o objeto pode ficar em cache
 * como imutável.
 */
export const createCoverUploadUrl = defineAction({
  nome: 'event.cover_upload_url',
  entidade: 'events',
  papelMinimo: 'editor',
  schema: z.object({
    eventId: z.uuid(),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
      message: 'A capa precisa ser uma imagem JPEG, PNG ou WebP.',
    }),
    // O mesmo teto do bucket `covers` (migration 0012).
    size: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024, 'A capa pode ter até 5 MB.'),
  }),
  async executar({ entrada, tx }) {
    const [evento] = await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, entrada.eventId))
    if (!evento) throw new FalhaDaAction('not_found', 'Não encontramos esse evento.')

    const caminho = `${entrada.eventId}/${randomUUID()}.${EXTENSAO[entrada.contentType]}`
    const { data, error } = await supabaseAdmin()
      .storage.from('covers')
      .createSignedUploadUrl(caminho)
    if (error) throw error

    return {
      data: { caminho, urlAssinada: data.signedUrl },
      entityId: entrada.eventId,
      diff: { caminho },
    }
  },
})
