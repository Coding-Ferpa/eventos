import type { EventoPublico } from '@/db/queries/events'

import { formatarLocal, isoEmSaoPaulo } from './format'

/**
 * Dados estruturados da página do evento (doc 09). Funções puras de propósito:
 * montar o objeto é a parte que tem regra e merece teste; renderizar é trivial.
 */

const COMUNIDADE = {
  '@type': 'Organization',
  name: 'Coding Ferpa',
  url: 'https://codingferpa.org',
} as const

/** O texto que uma pessoa leria, sem a marcação do Markdown. */
export function textoDoMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // imagem não vira texto
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // link vira o próprio texto
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '') // título, citação, lista
    .replace(/[*_~`]/g, '') // ênfase e código
    .replace(/\s+/g, ' ')
    .trim()
}

/** Descrição para buscador e compartilhamento: até 155 caracteres (doc 09). */
export function resumoDaDescricao(markdown: string, limite = 155): string {
  const texto = textoDoMarkdown(markdown)
  if (texto.length <= limite) return texto

  const corte = texto.slice(0, limite - 3)
  const ultimoEspaco = corte.lastIndexOf(' ')
  const inteiro = ultimoEspaco > 0 ? corte.slice(0, ultimoEspaco) : corte

  return `${inteiro.replace(/[\s.,;:!?]+$/, '')}...`
}

export function eventoJsonLd(
  evento: EventoPublico,
  { url, capa }: { url: string; capa: string },
) {
  // Sem cidade, o evento é on-line: a mesma regra de `formatarLocal`.
  const presencial = Boolean(evento.city?.trim())

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: evento.title,
    description: textoDoMarkdown(evento.descriptionMd),
    startDate: isoEmSaoPaulo(new Date(evento.startsAt)),
    ...(evento.endsAt ? { endDate: isoEmSaoPaulo(new Date(evento.endsAt)) } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: presencial
      ? 'https://schema.org/OfflineEventAttendanceMode'
      : 'https://schema.org/OnlineEventAttendanceMode',
    location: presencial
      ? {
          '@type': 'Place',
          name: evento.locationName ?? formatarLocal(evento),
          address: {
            '@type': 'PostalAddress',
            addressLocality: evento.city,
            ...(evento.state ? { addressRegion: evento.state } : {}),
            addressCountry: 'BR',
          },
        }
      : { '@type': 'VirtualLocation', url: evento.externalUrl ?? url },
    image: [capa],
    organizer: COMUNIDADE,
    isAccessibleForFree: true,
    url,
  }
}

/**
 * A credencial que o evento emite, e não a de uma pessoa: por isso fica na
 * página do evento, e não na de validação, que é `noindex` e tem nome de
 * gente (doc 09). Só existe depois que o evento emitiu certificados.
 */
export function credencialJsonLd(evento: EventoPublico, url: string) {
  if (evento.status !== 'certificates_available' && evento.status !== 'archived') {
    return null
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalCredential',
    name: `Certificado de participação: ${evento.title}`,
    credentialCategory: 'certificate',
    recognizedBy: COMUNIDADE,
    url,
  }
}

export function breadcrumbJsonLd(evento: EventoPublico, url: string, base: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Início', item: base },
      { '@type': 'ListItem', position: 2, name: evento.title, item: url },
    ],
  }
}

/**
 * JSON para dentro de `<script type="application/ld+json">`. O `<` escapado
 * impede que um título com `</script>` feche o bloco e vire HTML (doc 09).
 */
export function serializarJsonLd(dado: unknown): string {
  return JSON.stringify(dado).replace(/</g, '\\u003c')
}
