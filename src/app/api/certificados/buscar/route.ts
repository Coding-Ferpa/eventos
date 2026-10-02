import type { NextRequest } from 'next/server'

import { db } from '@/db/client'
import {
  findParticipant,
  getEventForSearch,
  recordSearchAttempt,
  type CriteriosDeBusca,
  type DesfechoDaBusca,
  type MetodoDeBusca,
} from '@/db/queries/public-lookup'
import { semBanco } from '@/lib/ambiente'
import { isValidCpf } from '@/lib/cpf'
import {
  COOKIE_DE_RETIRADA,
  OPCOES_DO_COOKIE_DE_RETIRADA,
  selarRetirada,
} from '@/lib/cookies/retrieval'
import { serverEnv } from '@/lib/env'
import { formatarEspera } from '@/lib/espera'
import { hmacCpf } from '@/lib/hmac'
import { origemDoSite, problema, SEM_CACHE } from '@/lib/problema'
import { consultarBalde, consumirBalde, LIMITES } from '@/lib/rate-limit'
import { requisitante } from '@/lib/requisicao'
import { z } from '@/lib/zod'

/**
 * `POST /api/certificados/buscar` (doc 07). A busca é um oráculo; o desenho é
 * o que o torna inútil para varredura (doc 08): 0 ou 1 pessoa, igualdade
 * sobre valor inteiro, dois baldes de rate limit, nada sobre a pessoa na
 * resposta, e ambíguo idêntico a não encontrado.
 */

export const runtime = 'nodejs'

const entradaSchema = z.object({
  event_slug: z.string().min(3).max(80),
  method: z.enum(['cpf', 'email', 'name', 'all']),
  cpf: z.string().trim().max(20).optional(),
  email: z.email('E-mail inválido.').max(254).optional(),
  full_name: z.string().trim().min(3, 'Digite o nome completo.').max(120).optional(),
  birth_date: z.iso.date('Data de nascimento inválida.').optional(),
})

const NAO_ENCONTRADO =
  'Não encontramos ninguém com esses dados neste evento. Confira se o nome está igual ao da inscrição.'
const INDISPONIVEL = 'Os certificados deste evento não estão disponíveis.'

function campoFaltando(campo: string, mensagem: string) {
  return problema(422, 'validation_error', 'Confira os campos destacados.', {
    fieldErrors: { [campo]: [mensagem] },
  })
}

export async function POST(request: NextRequest) {
  if (semBanco()) return problema(409, 'event_unavailable', INDISPONIVEL)
  if (!origemDoSite(request)) {
    return problema(403, 'forbidden', 'Esta busca só funciona pela página do evento.')
  }

  const lido = entradaSchema.safeParse(await request.json().catch(() => null))
  if (!lido.success) {
    return problema(422, 'validation_error', 'Confira os campos destacados.', {
      fieldErrors: z.flattenError(lido.error).fieldErrors as Record<string, string[]>,
    })
  }
  const entrada = lido.data
  const env = serverEnv()
  const quem = requisitante(request, env)

  return db().transaction(async (tx) => {
    const evento = await getEventForSearch(tx, entrada.event_slug)
    if (!evento) return problema(409, 'event_unavailable', INDISPONIVEL)
    if (evento.status !== 'certificates_available') {
      // Rascunho e inexistente respondem igual; o log só existe para evento real.
      await recordSearchAttempt(tx, {
        eventId: evento.eventId,
        method: entrada.method,
        outcome: 'event_unavailable',
        ipHash: quem.ipHash,
        deviceHash: quem.deviceHash,
      })
      return problema(409, 'event_unavailable', INDISPONIVEL)
    }
    const { search } = evento
    const metodo = entrada.method as MetodoDeBusca
    const registrar = (outcome: DesfechoDaBusca) =>
      recordSearchAttempt(tx, {
        eventId: evento.eventId,
        method: metodo,
        outcome,
        ipHash: quem.ipHash,
        deviceHash: quem.deviceHash,
      })

    // O método e os campos que ele exige (doc 07); a data de nascimento nunca
    // é chave sozinha (ADR-0009).
    const usaCpf = metodo === 'cpf' || (metodo === 'all' && search.byCpf)
    const usaEmail = metodo === 'email' || (metodo === 'all' && search.byEmail)
    const usaNome = metodo === 'name' || (metodo === 'all' && search.byName)
    const habilitado =
      metodo === 'all'
        ? search.mode === 'all'
        : search.mode === 'any' &&
          { cpf: search.byCpf, email: search.byEmail, name: search.byName }[metodo]
    if (!habilitado) {
      return problema(
        422,
        'validation_error',
        'Esta forma de busca não vale neste evento.',
      )
    }

    const criterios: CriteriosDeBusca = {}
    if (usaCpf) {
      const digitos = (entrada.cpf ?? '').replace(/\D/g, '')
      if (!entrada.cpf) return campoFaltando('cpf', 'Digite o CPF.')
      // Dígito verificador errado é erro de digitação, e não "não encontrado".
      if (!isValidCpf(digitos))
        return campoFaltando('cpf', 'Confira o CPF: os números não conferem.')
      criterios.cpfHash = hmacCpf(env.CPF_PEPPER, evento.cpfSalt, digitos)
    }
    if (usaEmail) {
      if (!entrada.email) return campoFaltando('email', 'Digite o e-mail.')
      criterios.email = entrada.email.trim().toLowerCase()
    }
    if (usaNome) {
      if (!entrada.full_name) return campoFaltando('full_name', 'Digite o nome completo.')
      criterios.fullName = entrada.full_name
      if (search.birthDateRequired) {
        if (!entrada.birth_date)
          return campoFaltando('birth_date', 'Digite a data de nascimento.')
        criterios.birthDate = entrada.birth_date
      }
    }

    // Os dois baldes (ADR-0006): o de dispositivo gasta sempre; o de IP só é
    // consultado aqui, e gasta depois, se a busca falhar.
    const chaveDoDispositivo = `search:dev:${evento.eventId}:${quem.deviceHash}`
    const chaveDoIp = `search:ip:${evento.eventId}:${quem.ipHash}`
    const porDispositivo = await consumirBalde(
      tx,
      chaveDoDispositivo,
      LIMITES.buscaPorDispositivo,
    )
    const porIp = porDispositivo.permitido
      ? await consultarBalde(tx, chaveDoIp, LIMITES.buscaPorIp)
      : porDispositivo
    if (!porIp.permitido) {
      await registrar('rate_limited')
      return problema(
        429,
        'rate_limited',
        `Muitas tentativas seguidas. Você pode tentar de novo em ${formatarEspera(porIp.esperarSegundos)}.`,
        { headers: { 'Retry-After': String(porIp.esperarSegundos) } },
      )
    }

    const resultado = await findParticipant(tx, evento.eventId, criterios)
    await registrar(resultado.outcome)
    if (resultado.outcome !== 'found') {
      await consumirBalde(tx, chaveDoIp, LIMITES.buscaPorIp)
      return problema(404, 'not_found', NAO_ENCONTRADO)
    }

    const cookie = selarRetirada(Buffer.from(env.RETRIEVAL_COOKIE_KEY, 'base64'), {
      pids: resultado.pids,
      src: `search_${metodo}`,
    })
    const resposta = Response.json(
      { ok: true, redirect: `/eventos/${entrada.event_slug}/certificado` },
      { headers: SEM_CACHE },
    )
    const { maxAge, ...opcoes } = OPCOES_DO_COOKIE_DE_RETIRADA
    resposta.headers.append(
      'Set-Cookie',
      `${COOKIE_DE_RETIRADA}=${cookie}; Max-Age=${maxAge}; Path=${opcoes.path}; HttpOnly; Secure; SameSite=Lax`,
    )
    return resposta
  })
}
