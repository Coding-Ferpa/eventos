import { formatCode } from './code'
import type { DataValue } from './data-schema'
import {
  formatCpfMasked,
  formatDateLong,
  formatDateShort,
  formatEventDateLong,
  formatEventDateShort,
  formatHours,
  formatNumber,
  formatSequence,
} from './format'
import type { DataField } from './schema'

/**
 * Placeholders do certificado (doc 05): lista fechada, sem linguagem de
 * filtros. Formato alternativo é outro token (`hours`, `hours_short`,
 * `hours_long`), e não um filtro sobre o mesmo.
 */

export type TokenContext = {
  /** `NEXT_PUBLIC_SITE_URL`: o QR e a URL de validação apontam para ele. */
  siteUrl: string
  participant: { fullName: string; cpfLast3: string | null }
  event: {
    title: string
    locationName: string | null
    city: string | null
    startsAt: Date
    endsAt: Date | null
  }
  participation: { label: string }
  certificate: {
    hours: number
    code: string
    issuedAt: Date | null
    sequence: number
    data: Record<string, DataValue>
  }
}

const ANO = new Intl.DateTimeFormat('pt-BR', {
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
})

/** O endereço sem `https://` e sem barra final, para caber na linha. */
function host(siteUrl: string): string {
  return siteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

const FIXOS = {
  'participant.full_name': (c: TokenContext) => c.participant.fullName,
  'participant.cpf_masked': (c: TokenContext) => formatCpfMasked(c.participant.cpfLast3),
  'event.title': (c: TokenContext) => c.event.title,
  'event.location': (c: TokenContext) => c.event.locationName ?? '',
  'event.city': (c: TokenContext) => c.event.city ?? '',
  'event.date_short': (c: TokenContext) =>
    formatEventDateShort(c.event.startsAt, c.event.endsAt),
  'event.date_long': (c: TokenContext) =>
    formatEventDateLong(c.event.startsAt, c.event.endsAt),
  'participation.label': (c: TokenContext) => c.participation.label,
  'certificate.hours': (c: TokenContext) => formatHours(c.certificate.hours, 'number'),
  'certificate.hours_short': (c: TokenContext) =>
    formatHours(c.certificate.hours, 'short'),
  'certificate.hours_long': (c: TokenContext) => formatHours(c.certificate.hours, 'long'),
  'certificate.code': (c: TokenContext) => formatCode(c.certificate.code),
  'certificate.validation_url': (c: TokenContext) =>
    `${host(c.siteUrl)}/validar/${c.certificate.code}`,
  'certificate.issued_at_short': (c: TokenContext) =>
    c.certificate.issuedAt ? formatDateShort(c.certificate.issuedAt) : '',
  'certificate.issued_at_long': (c: TokenContext) =>
    c.certificate.issuedAt ? formatDateLong(c.certificate.issuedAt) : '',
  'certificate.sequence': (c: TokenContext) => formatSequence(c.certificate.sequence),
  // A sequência é por evento, então o ano é o do evento.
  'certificate.sequence_year': (c: TokenContext) =>
    formatSequence(c.certificate.sequence, Number(ANO.format(c.event.startsAt))),
} satisfies Record<string, (contexto: TokenContext) => string>

/** Os tokens fixos, na ordem do doc 05: os chips do editor saem daqui. */
export const TOKENS = Object.keys(FIXOS)

const PADRAO = /\{\{\s*([a-z0-9_.]+)\s*\}\}/g

function formatarDado(campo: DataField, valor: DataValue | undefined): string {
  if (valor === undefined) return ''
  switch (campo.format.type) {
    case 'text':
      return String(valor)
    case 'number':
      return formatNumber(Number(valor), campo.format.decimals)
    case 'date':
      return campo.format.style === 'long'
        ? formatDateLong(String(valor))
        : formatDateShort(String(valor))
    case 'hours':
      return formatHours(Number(valor), campo.format.style)
  }
}

/**
 * Troca cada placeholder pelo valor formatado. Token desconhecido vira texto
 * vazio, mas nunca chega aqui: `findUnknownTokens` impede salvar o modelo.
 */
export function resolveTokens(
  conteudo: string,
  contexto: TokenContext,
  dataFields: DataField[],
): string {
  return conteudo.replace(PADRAO, (_, token: string) => {
    if (token in FIXOS) return FIXOS[token as keyof typeof FIXOS](contexto)

    if (token.startsWith('data.')) {
      const chave = token.slice('data.'.length)
      const campo = dataFields.find((declarado) => declarado.key === chave)
      if (campo) return formatarDado(campo, contexto.certificate.data[chave])
    }
    return ''
  })
}

/** Os tokens do conteúdo que o modelo não conhece, na ordem em que aparecem. */
/** Os placeholders de um conteúdo, na ordem, lidos como o motor lê. */
export function usedTokens(conteudo: string): string[] {
  return [...conteudo.matchAll(PADRAO)].map((casamento) => casamento[1] ?? '')
}

export function findUnknownTokens(conteudo: string, dataFields: DataField[]): string[] {
  const chaves = new Set(dataFields.map((campo) => campo.key))
  return usedTokens(conteudo).filter(
    (token) =>
      !(token in FIXOS) && !(token.startsWith('data.') && chaves.has(token.slice(5))),
  )
}
