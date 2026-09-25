import { describe, expect, it } from 'vitest'

import {
  atualizacaoDeEventoSchema,
  novoEventoSchema,
  problemasDaBusca,
  problemaNaTransicao,
  TIPOS_PADRAO,
} from './event'

const NOVO = {
  title: 'Ferpa Tech Day 2027',
  startsAt: '2027-09-11T08:00',
}

describe('novoEventoSchema', () => {
  it('aceita o mínimo: título e início, com o início lido em São Paulo', () => {
    const evento = novoEventoSchema.parse(NOVO)

    expect(evento.title).toBe('Ferpa Tech Day 2027')
    expect(evento.startsAt.toISOString()).toBe('2027-09-11T11:00:00.000Z')
    expect(evento.descriptionMd).toBe('')
  })

  it('campo deixado em branco no formulário vira nulo, e não texto vazio', () => {
    const evento = novoEventoSchema.parse({ ...NOVO, city: '  ', state: '', endsAt: '' })

    expect(evento.city).toBeNull()
    expect(evento.state).toBeNull()
    expect(evento.endsAt).toBeNull()
  })

  it('recusa término antes do início, apontando o campo do término', () => {
    const resultado = novoEventoSchema.safeParse({ ...NOVO, endsAt: '2027-09-11T07:59' })

    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.path).toEqual(['endsAt'])
  })

  it.each([
    ['slug', 'Ferpa Tech Day'],
    ['slug', 'a'],
    ['state', 'XX'],
    ['externalUrl', 'http://inscricoes.example.com'],
    ['contactEmail', 'não é e-mail'],
    ['title', 'ab'],
  ])('recusa %s = %j', (campo, valor) => {
    const resultado = novoEventoSchema.safeParse({ ...NOVO, [campo]: valor })

    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0]?.path).toEqual([campo])
  })

  it('aceita o evento completo', () => {
    expect(
      novoEventoSchema.safeParse({
        ...NOVO,
        slug: 'ferpa-tech-day-2027',
        endsAt: '2027-09-11T18:00',
        locationName: 'Auditório',
        city: 'Fernandópolis',
        state: 'SP',
        externalUrl: 'https://inscricoes.example.com/ftd',
        descriptionMd: '## Programação',
        contactEmail: 'contato@example.com',
      }).success,
    ).toBe(true)
  })
})

describe('atualizacaoDeEventoSchema', () => {
  it('aceita mudança parcial: só o que veio muda', () => {
    const mudanca = atualizacaoDeEventoSchema.parse({
      id: '5e000000-0000-4000-8000-000000000001',
      searchByName: true,
    })

    expect(mudanca).toEqual({
      id: '5e000000-0000-4000-8000-000000000001',
      searchByName: true,
    })
  })

  it('campo apagado vira nulo, que apaga; campo ausente não muda nada', () => {
    const id = '5e000000-0000-4000-8000-000000000001'

    expect(atualizacaoDeEventoSchema.parse({ id, externalUrl: '' })).toEqual({
      id,
      externalUrl: null,
    })
    expect(atualizacaoDeEventoSchema.parse({ id })).toEqual({ id })
  })

  it('a capa só pode apontar para a pasta do próprio evento', () => {
    const id = '5e000000-0000-4000-8000-000000000001'

    expect(
      atualizacaoDeEventoSchema.safeParse({
        id,
        coverPath: `${id}/0b4ed4e6-2a4c-4f7e-9d71-1f5e2d3c4b5a.webp`,
      }).success,
    ).toBe(true)
    expect(
      atualizacaoDeEventoSchema.safeParse({
        id,
        coverPath: 'de000000-0000-4000-8000-00000000e001/outra.webp',
      }).success,
    ).toBe(false)
    expect(atualizacaoDeEventoSchema.safeParse({ id, coverPath: null }).success).toBe(
      true,
    )
  })
})

describe('problemasDaBusca (ADR-0009)', () => {
  const NADA = {
    searchByCpf: false,
    searchByEmail: false,
    searchByName: false,
    searchBirthDate: false,
    searchMode: 'any' as const,
  }

  it('sem chave nenhuma está bem enquanto os certificados não estão no ar', () => {
    expect(problemasDaBusca(NADA, 'completed')).toEqual({})
  })

  it('com os certificados no ar, exige ao menos uma chave independente', () => {
    expect(problemasDaBusca(NADA, 'certificates_available')).toHaveProperty(
      'searchByName',
    )
    expect(
      problemasDaBusca({ ...NADA, searchByEmail: true }, 'certificates_available'),
    ).toEqual({})
  })

  it('a data de nascimento nunca é chave sozinha', () => {
    for (const searchMode of ['any', 'all'] as const) {
      expect(
        problemasDaBusca({ ...NADA, searchBirthDate: true, searchMode }, 'draft'),
      ).toHaveProperty('searchBirthDate')
    }
  })

  it('no modo "qualquer um" ela é o segundo fator do nome, e exige o nome', () => {
    expect(
      problemasDaBusca(
        { ...NADA, searchByEmail: true, searchBirthDate: true, searchMode: 'any' },
        'draft',
      ),
    ).toHaveProperty('searchBirthDate')
    expect(
      problemasDaBusca(
        { ...NADA, searchByName: true, searchBirthDate: true, searchMode: 'any' },
        'draft',
      ),
    ).toEqual({})
  })

  it('no modo "todos" ela é mais um campo exigido, ao lado de qualquer chave', () => {
    expect(
      problemasDaBusca(
        { ...NADA, searchByEmail: true, searchBirthDate: true, searchMode: 'all' },
        'draft',
      ),
    ).toEqual({})
  })
})

describe('problemaNaTransicao', () => {
  it('as transições são livres entre os estados comuns', () => {
    expect(problemaNaTransicao('draft', 'registration_open')).toBeNull()
    expect(problemaNaTransicao('registration_open', 'completed')).toBeNull()
    expect(problemaNaTransicao('certificates_available', 'archived')).toBeNull()
    expect(problemaNaTransicao('archived', 'certificates_available')).not.toBeNull()
  })

  it('certificados disponíveis só pela liberação, que confere o que falta', () => {
    expect(problemaNaTransicao('completed', 'certificates_available')).toMatch(
      /liberação/,
    )
  })

  it('quem saiu do rascunho não volta: o endereço pode estar num cartaz', () => {
    expect(problemaNaTransicao('registration_open', 'draft')).toMatch(/arquive/i)
    expect(problemaNaTransicao('draft', 'draft')).toBeNull()
  })
})

describe('TIPOS_PADRAO (doc 04)', () => {
  it('são os quatro do PRD, com carga horária a definir', () => {
    expect(TIPOS_PADRAO.map((tipo) => tipo.slug)).toEqual([
      'participante',
      'palestrante',
      'organizador',
      'monitor',
    ])
    expect(TIPOS_PADRAO.every((tipo) => tipo.defaultHours === '0')).toBe(true)
  })
})
