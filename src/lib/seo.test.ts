import { describe, expect, it } from 'vitest'

import type { EventoPublico } from '@/db/queries/events'

import {
  breadcrumbJsonLd,
  credencialJsonLd,
  eventoJsonLd,
  resumoDaDescricao,
  serializarJsonLd,
  textoDoMarkdown,
} from './seo'

const BASE = 'https://eventos.codingferpa.org'
const URL_DO_EVENTO = `${BASE}/eventos/ferpa-tech-day-2026`
const CAPA = `${BASE}/eventos/ferpa-tech-day-2026/capa`

const EVENTO: EventoPublico = {
  slug: 'ferpa-tech-day-2026',
  title: 'Ferpa Tech Day 2026',
  status: 'certificates_available',
  startsAt: '2026-09-12T11:00:00.000Z',
  endsAt: '2026-09-12T21:00:00.000Z',
  city: 'Fernandópolis',
  state: 'SP',
  coverPath: null,
  descriptionMd: 'Um dia de **palestras**.\n\n## Programação\n\n- Abertura',
  locationName: 'Auditório da Faculdade',
  externalUrl: null,
  updatedAt: '2026-09-14T15:00:00.000Z',
  search: {
    mode: 'any',
    byCpf: true,
    byEmail: false,
    byName: false,
    birthDateRequired: false,
  },
  contactEmail: null,
  contactUrl: null,
}

describe('textoDoMarkdown', () => {
  it('tira a marcação e fica com o texto que uma pessoa leria', () => {
    expect(
      textoDoMarkdown(
        '## Programação\n\n- **Abertura** e _palestra_\n- Veja o [site](https://x.org)\n\n> citação `código`',
      ),
    ).toBe('Programação Abertura e palestra Veja o site citação código')
  })

  it('imagem não vira texto', () => {
    expect(textoDoMarkdown('Antes ![capa do evento](https://x.org/a.png) depois')).toBe(
      'Antes depois',
    )
  })
})

describe('resumoDaDescricao', () => {
  it('texto curto sai inteiro', () => {
    expect(resumoDaDescricao('Um dia de **palestras**.')).toBe('Um dia de palestras.')
  })

  it('corta em até 155 caracteres, no fim de uma palavra, com reticências', () => {
    const longo = 'palavra '.repeat(40)
    const resumo = resumoDaDescricao(longo)

    expect(resumo.length).toBeLessThanOrEqual(155)
    expect(resumo.endsWith('palavra...')).toBe(true)
  })
})

describe('eventoJsonLd', () => {
  it('descreve o evento presencial no vocabulário do schema.org', () => {
    expect(eventoJsonLd(EVENTO, { url: URL_DO_EVENTO, capa: CAPA })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Ferpa Tech Day 2026',
      description: 'Um dia de palestras. Programação Abertura',
      startDate: '2026-09-12T08:00:00-03:00',
      endDate: '2026-09-12T18:00:00-03:00',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: {
        '@type': 'Place',
        name: 'Auditório da Faculdade',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Fernandópolis',
          addressRegion: 'SP',
          addressCountry: 'BR',
        },
      },
      image: [CAPA],
      organizer: {
        '@type': 'Organization',
        name: 'Coding Ferpa',
        url: 'https://codingferpa.org',
      },
      isAccessibleForFree: true,
      url: URL_DO_EVENTO,
    })
  })

  it('evento sem cidade é on-line, com local virtual e sem data de fim inventada', () => {
    const json = eventoJsonLd(
      { ...EVENTO, city: null, state: null, endsAt: null, externalUrl: 'https://meet.x' },
      { url: URL_DO_EVENTO, capa: CAPA },
    )

    expect(json.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode')
    expect(json.location).toEqual({ '@type': 'VirtualLocation', url: 'https://meet.x' })
    expect(json).not.toHaveProperty('endDate')
  })
})

describe('credencialJsonLd', () => {
  it('descreve a credencial que o evento emite, e não a de uma pessoa', () => {
    expect(credencialJsonLd(EVENTO, URL_DO_EVENTO)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'EducationalOccupationalCredential',
      name: 'Certificado de participação: Ferpa Tech Day 2026',
      credentialCategory: 'certificate',
      recognizedBy: {
        '@type': 'Organization',
        name: 'Coding Ferpa',
        url: 'https://codingferpa.org',
      },
      url: URL_DO_EVENTO,
    })
  })

  it('só existe quando o evento já emitiu certificados (doc 09)', () => {
    expect(
      credencialJsonLd({ ...EVENTO, status: 'archived' }, URL_DO_EVENTO),
    ).not.toBeNull()

    for (const status of [
      'registration_open',
      'registration_closed',
      'in_progress',
      'completed',
    ] as const) {
      expect(credencialJsonLd({ ...EVENTO, status }, URL_DO_EVENTO)).toBeNull()
    }
  })
})

describe('breadcrumbJsonLd', () => {
  it('Início, depois o evento', () => {
    expect(breadcrumbJsonLd(EVENTO, URL_DO_EVENTO, BASE)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: BASE },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Ferpa Tech Day 2026',
          item: URL_DO_EVENTO,
        },
      ],
    })
  })
})

describe('serializarJsonLd', () => {
  it('escapa o "<", para um título com </script> não fechar o bloco', () => {
    const texto = serializarJsonLd({ name: '</script><script>alert(1)</script>' })

    expect(texto).not.toContain('<')
    expect(JSON.parse(texto)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})
