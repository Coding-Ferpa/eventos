import { describe, expect, it } from 'vitest'

import type { DataField } from './schema'
import { findUnknownTokens, resolveTokens, TOKENS, type TokenContext } from './tokens'

const CONTEXTO: TokenContext = {
  siteUrl: 'https://eventos.codingferpa.org/',
  participant: { fullName: 'José Gonçalves de Assunção', cpfLast3: '145' },
  event: {
    title: 'Ferpa Tech Day 2026',
    locationName: 'Auditório da Faculdade',
    city: 'Fernandópolis',
    startsAt: new Date('2026-09-12T11:00:00Z'),
    endsAt: new Date('2026-09-12T21:00:00Z'),
  },
  participation: { label: 'Palestrante' },
  certificate: {
    hours: 1.5,
    code: 'DEM0CF2026',
    issuedAt: new Date('2026-09-14T15:00:00Z'),
    sequence: 42,
    data: {
      titulo_palestra: 'Git na prática',
      data_defesa: '2026-09-01',
      horas_oficina: 8,
    },
  },
}

const CAMPOS: DataField[] = [
  {
    key: 'titulo_palestra',
    label: 'Título da palestra',
    type: 'text',
    required: true,
    default: null,
    format: { type: 'text', max_length: 120 },
  },
  {
    key: 'data_defesa',
    label: 'Data da defesa',
    type: 'date',
    required: false,
    default: null,
    format: { type: 'date', style: 'long' },
  },
  {
    key: 'horas_oficina',
    label: 'Horas de oficina',
    type: 'hours',
    required: false,
    default: null,
    format: { type: 'hours', style: 'long' },
  },
  {
    key: 'turma',
    label: 'Turma',
    type: 'text',
    required: false,
    default: null,
    format: { type: 'text', max_length: 40 },
  },
]

const resolver = (conteudo: string) => resolveTokens(conteudo, CONTEXTO, CAMPOS)

// PDF-19 do doc 05.
describe('resolveTokens', () => {
  it.each([
    ['{{participant.full_name}}', 'José Gonçalves de Assunção'],
    ['{{participant.cpf_masked}}', '***.***.**1-45'],
    ['{{event.title}}', 'Ferpa Tech Day 2026'],
    ['{{event.location}}', 'Auditório da Faculdade'],
    ['{{event.city}}', 'Fernandópolis'],
    ['{{event.date_short}}', '12/09/2026'],
    ['{{event.date_long}}', '12 de setembro de 2026'],
    ['{{participation.label}}', 'Palestrante'],
    ['{{certificate.hours}}', '1,5'],
    ['{{certificate.hours_short}}', '1,5h'],
    ['{{certificate.hours_long}}', '1,5 hora'],
    ['{{certificate.code}}', 'DEM0-CF2-026'],
    ['{{certificate.validation_url}}', 'eventos.codingferpa.org/validar/DEM0CF2026'],
    ['{{certificate.issued_at_short}}', '14/09/2026'],
    ['{{certificate.issued_at_long}}', '14 de setembro de 2026'],
    ['{{certificate.sequence}}', '0042'],
    ['{{certificate.sequence_year}}', '0042/2026'],
    ['{{data.titulo_palestra}}', 'Git na prática'],
    ['{{data.data_defesa}}', '1 de setembro de 2026'],
    ['{{data.horas_oficina}}', '8 horas'],
  ])('%s → %s', (conteudo, esperado) => {
    expect(resolver(conteudo)).toBe(esperado)
  })

  it('resolve um parágrafo inteiro, com espaço dentro das chaves', () => {
    expect(
      resolver(
        'participou como {{ participation.label }} com a palestra {{data.titulo_palestra}}, com carga horária de {{certificate.hours_long}}.',
      ),
    ).toBe(
      'participou como Palestrante com a palestra Git na prática, com carga horária de 1,5 hora.',
    )
  })

  it('campo de conteúdo declarado e vazio neste certificado vira texto vazio', () => {
    expect(resolver('Turma: {{data.turma}}')).toBe('Turma: ')
  })

  it('sem CPF e sem emissão, os tokens deles viram texto vazio', () => {
    const semDados = {
      ...CONTEXTO,
      participant: { ...CONTEXTO.participant, cpfLast3: null },
      certificate: { ...CONTEXTO.certificate, issuedAt: null },
    }
    expect(
      resolveTokens(
        '[{{participant.cpf_masked}}][{{certificate.issued_at_short}}]',
        semDados,
        CAMPOS,
      ),
    ).toBe('[][]')
  })
})

describe('findUnknownTokens', () => {
  it('aponta token fora da lista e data.<key> não declarada', () => {
    expect(
      findUnknownTokens(
        '{{participant.nome}} {{data.orientador}} {{data.turma}} {{event.title}}',
        CAMPOS,
      ),
    ).toEqual(['participant.nome', 'data.orientador'])
  })

  it('conteúdo só com tokens conhecidos passa', () => {
    expect(
      findUnknownTokens('{{participant.full_name}}, {{data.titulo_palestra}}', CAMPOS),
    ).toEqual([])
  })
})

describe('TOKENS', () => {
  it('é a lista fechada do doc 05, para os chips do editor', () => {
    expect(TOKENS).toHaveLength(17)
    expect(TOKENS).toContain('certificate.validation_url')
  })
})
