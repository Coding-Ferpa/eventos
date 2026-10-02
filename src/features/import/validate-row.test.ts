// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type { DataField } from '@/features/certificate/schema'
import { hmacCpf } from '@/lib/hmac'

import { validateRow, type ImportType, type ValidateContext } from './validate-row'

const titulo: DataField = {
  key: 'titulo_palestra',
  label: 'Título da palestra',
  type: 'text',
  required: true,
  default: null,
  format: { type: 'text', max_length: 20 },
}
const turma: DataField = {
  key: 'turma',
  label: 'Turma',
  type: 'text',
  required: false,
  default: 'Turma única',
  format: { type: 'text', max_length: 40 },
}
const horasExtras: DataField = {
  key: 'horas_extras',
  label: 'Horas extras',
  type: 'hours',
  required: false,
  default: null,
  format: { type: 'hours', style: 'short' },
}

const PARTICIPANTE: ImportType = {
  id: 'tipo-participante',
  slug: 'participante',
  label: 'Participante',
  aliases: ['ouvinte'],
  dataFields: [turma, horasExtras],
}
const PALESTRANTE: ImportType = {
  id: 'tipo-palestrante',
  slug: 'palestrante',
  label: 'Palestrante',
  aliases: ['speaker'],
  dataFields: [titulo],
}
const MONITOR: ImportType = {
  id: 'tipo-monitor',
  slug: 'monitor',
  label: 'Monitor',
  aliases: [],
  dataFields: null,
}

const PEPPER = 'pepper-de-teste-com-mais-de-trinta-e-dois-caracteres'
const SAL = '0123456789abcdef0123456789abcdef'

const contexto = (extra: Partial<ValidateContext> = {}): ValidateContext => ({
  types: [PARTICIPANTE, PALESTRANTE, MONITOR],
  fixedTypeId: 'tipo-participante',
  search: { byCpf: true, byEmail: false, byName: true, birthDate: false, mode: 'any' },
  hashCpf: (cpf) => hmacCpf(PEPPER, SAL, cpf),
  today: new Date('2026-10-02T12:00:00Z'),
  ...extra,
})

const codigos = (linha: ReturnType<typeof validateRow>) => linha.issues.map((p) => p.code)

describe('validateRow: identidade', () => {
  it('a linha da planilha principal sai normalizada, com o CPF já em HMAC', () => {
    const linha = validateRow(
      2,
      {
        full_name: '  José   Gonçalves de Assunção ',
        cpf: '529.982.247-25',
        birth_date: '12/09/1990',
        email: ' Jose.Assuncao@Exemplo.ORG ',
        hours: '4,5',
      },
      contexto(),
    )
    expect(linha).toEqual({
      rowNumber: 2,
      participationTypeId: 'tipo-participante',
      fullName: 'José Gonçalves de Assunção',
      cpfHash: hmacCpf(PEPPER, SAL, '52998224725'),
      cpfLast3: '725',
      birthDate: '1990-09-12',
      email: 'jose.assuncao@exemplo.org',
      hours: 4.5,
      data: {},
      dataDefaults: { turma: 'Turma única' },
      issues: [],
    })
  })

  it('o CPF em claro não sai da função, em lugar nenhum do resultado', () => {
    const linha = validateRow(
      2,
      { full_name: 'Ana Lima', cpf: '529.982.247-25' },
      contexto(),
    )
    expect(JSON.stringify(linha)).not.toMatch(/52998224725|529\.982\.247/)
  })

  it('célula vazia é "sem informação": nulo, nunca texto vazio', () => {
    const linha = validateRow(
      2,
      { full_name: 'Ana Lima', cpf: ' ', birth_date: '', email: '', hours: '' },
      contexto(),
    )
    expect(linha).toMatchObject({
      cpfHash: null,
      cpfLast3: null,
      birthDate: null,
      email: null,
      hours: null,
    })
    expect(linha.issues).toEqual([])
  })

  it.each([
    [{ full_name: '   ' }, 'NAME_REQUIRED'],
    [{ full_name: 'A'.repeat(121) }, 'NAME_TOO_LONG'],
    [{ full_name: 'Ana Lima', cpf: '529.982.247-24' }, 'CPF_INVALID'],
    [{ full_name: 'Ana Lima', cpf: '111.111.111-11' }, 'CPF_REPEATED_DIGITS'],
    [{ full_name: 'Ana Lima', cpf: '1,23457E+10' }, 'CPF_SCIENTIFIC_NOTATION'],
    [{ full_name: 'Ana Lima', birth_date: '12/09/90' }, 'DATE_UNRECOGNIZED'],
    [{ full_name: 'Ana Lima', birth_date: '09/31/1990' }, 'DATE_UNRECOGNIZED'],
    [{ full_name: 'Ana Lima', birth_date: '31/12/1899' }, 'DATE_IMPLAUSIBLE'],
    [{ full_name: 'Ana Lima', birth_date: '03/10/2021' }, 'DATE_IMPLAUSIBLE'],
    [{ full_name: 'Ana Lima', email: 'ana@' }, 'EMAIL_INVALID'],
    // Formato válido, mas acima dos 254 caracteres do check de participants.
    [
      {
        full_name: 'Ana Lima',
        email: `ana@${Array(5).fill('b'.repeat(60)).join('.')}.org`,
      },
      'EMAIL_INVALID',
    ],
    [{ full_name: 'Ana Lima', hours: 'oito' }, 'HOURS_INVALID'],
    [{ full_name: 'Ana Lima', hours: '-1' }, 'HOURS_INVALID'],
    [{ full_name: 'Ana Lima', hours: '10000' }, 'HOURS_INVALID'],
  ])('%j é %s', (celulas, codigo) => {
    const linha = validateRow(7, celulas, contexto())
    expect(linha.issues).toEqual([
      expect.objectContaining({ code: codigo, severity: 'error' }),
    ])
  })

  it('nascimento a exatamente 5 anos de hoje ainda é plausível', () => {
    expect(
      validateRow(2, { full_name: 'Ana Lima', birth_date: '02/10/2021' }, contexto())
        .issues,
    ).toEqual([])
  })

  it('erro numa coluna não apaga as outras: a prévia mostra tudo o que dá para mostrar', () => {
    const linha = validateRow(
      2,
      { full_name: 'Ana Lima', cpf: '123', email: 'ana@x.org' },
      contexto(),
    )
    expect(linha).toMatchObject({
      fullName: 'Ana Lima',
      email: 'ana@x.org',
      cpfHash: null,
    })
    expect(codigos(linha)).toEqual(['CPF_INVALID'])
  })
})

describe('validateRow: tipo e conteúdo', () => {
  const variosTipos = (extra: Partial<ValidateContext> = {}) =>
    contexto({ fixedTypeId: null, ...extra })

  it.each(['Palestrante', 'palestrante', 'SPEAKER', ' speaker '])(
    'o tipo %j casa por slug, rótulo ou apelido',
    (valor) => {
      const linha = validateRow(
        2,
        {
          full_name: 'Ana Lima',
          participation_type: valor,
          'data.titulo_palestra': 'Git',
        },
        variosTipos(),
      )
      expect(linha.participationTypeId).toBe('tipo-palestrante')
      expect(linha.issues).toEqual([])
    },
  )

  it('tipo que não casa é TYPE_UNKNOWN; tipo sem modelo é TYPE_WITHOUT_TEMPLATE', () => {
    expect(
      codigos(
        validateRow(
          2,
          { full_name: 'Ana Lima', participation_type: 'VIP' },
          variosTipos(),
        ),
      ),
    ).toEqual(['TYPE_UNKNOWN'])
    expect(
      codigos(
        validateRow(2, { full_name: 'Ana Lima', participation_type: '' }, variosTipos()),
      ),
    ).toEqual(['TYPE_UNKNOWN'])
    expect(
      codigos(
        validateRow(
          2,
          { full_name: 'Ana Lima', participation_type: 'monitor' },
          variosTipos(),
        ),
      ),
    ).toEqual(['TYPE_WITHOUT_TEMPLATE'])
  })

  it('a linha é roteada para o modelo do seu tipo: palestrante sem título é erro; participante, não', () => {
    const palestrante = validateRow(
      2,
      { full_name: 'Ana Lima', participation_type: 'palestrante' },
      variosTipos(),
    )
    expect(palestrante.issues).toEqual([
      expect.objectContaining({
        code: 'FIELD_REQUIRED',
        field: 'titulo_palestra',
        severity: 'error',
      }),
    ])
    const participante = validateRow(
      2,
      { full_name: 'Bia Souza', participation_type: 'ouvinte' },
      variosTipos(),
    )
    expect(participante.issues).toEqual([])
  })

  it('coluna preenchida para um modelo que não declara a chave vira aviso e fica de fora', () => {
    const linha = validateRow(
      3,
      {
        full_name: 'Bia Souza',
        participation_type: 'participante',
        'data.titulo_palestra': 'Não cabe aqui',
      },
      variosTipos(),
    )
    expect(linha.data).toEqual({})
    expect(linha.issues).toEqual([
      expect.objectContaining({
        code: 'FIELD_NOT_IN_TEMPLATE',
        field: 'titulo_palestra',
        severity: 'warning',
      }),
    ])
  })

  it('conteúdo: o valor da célula vai para data; o padrão, só para dataDefaults', () => {
    const comTurma = validateRow(
      2,
      { full_name: 'Ana Lima', 'data.turma': ' B ', 'data.horas_extras': '2h' },
      contexto(),
    )
    expect(comTurma).toMatchObject({
      data: { turma: 'B', horas_extras: 2 },
      dataDefaults: {},
    })
    // Vazio não vira o padrão em `data`: na atualização, célula vazia não mexe
    // em nada (doc 06), e o padrão só serve para o certificado novo.
    const vazia = validateRow(2, { full_name: 'Ana Lima', 'data.turma': '' }, contexto())
    expect(vazia).toMatchObject({ data: {}, dataDefaults: { turma: 'Turma única' } })
  })

  it.each([
    [{ 'data.titulo_palestra': 'Um título bem maior que vinte' }, 'FIELD_TOO_LONG'],
    [{ 'data.titulo_palestra': '529.982.247-25' }, 'CONTENT_LOOKS_LIKE_CPF'],
  ])('conteúdo %j é %s, com a chave', (celulas, codigo) => {
    const linha = validateRow(
      2,
      { full_name: 'Ana Lima', ...celulas },
      contexto({ fixedTypeId: 'tipo-palestrante' }),
    )
    expect(linha.issues).toEqual([
      expect.objectContaining({ code: codigo, field: 'titulo_palestra' }),
    ])
    expect(linha.data).toEqual({})
  })

  it('horas de conteúdo inválidas são FIELD_INVALID', () => {
    const linha = validateRow(
      2,
      { full_name: 'Ana Lima', 'data.horas_extras': 'muitas' },
      contexto(),
    )
    expect(codigos(linha)).toEqual(['FIELD_INVALID'])
  })
})

describe('validateRow: NO_SEARCHABLE_KEY', () => {
  const busca = (search: Partial<ValidateContext['search']>) =>
    contexto({
      search: {
        byCpf: false,
        byEmail: false,
        byName: false,
        birthDate: false,
        mode: 'any',
        ...search,
      },
    })

  it('qualquer um: basta uma chave habilitada presente', () => {
    expect(
      codigos(validateRow(2, { full_name: 'Ana Lima' }, busca({ byCpf: true }))),
    ).toEqual(['NO_SEARCHABLE_KEY'])
    expect(
      codigos(
        validateRow(
          2,
          { full_name: 'Ana Lima', email: 'a@x.org' },
          busca({ byCpf: true, byEmail: true }),
        ),
      ),
    ).toEqual([])
  })

  it('qualquer um com nascimento: o nome só serve com a data junto (ADR-0009)', () => {
    const ctx = busca({ byName: true, birthDate: true })
    expect(codigos(validateRow(2, { full_name: 'Ana Lima' }, ctx))).toEqual([
      'NO_SEARCHABLE_KEY',
    ])
    expect(
      codigos(validateRow(2, { full_name: 'Ana Lima', birth_date: '01/01/2000' }, ctx)),
    ).toEqual([])
  })

  it('todos: falta qualquer um dos habilitados, avisa', () => {
    const ctx = busca({ byCpf: true, byName: true, mode: 'all' })
    expect(codigos(validateRow(2, { full_name: 'Ana Lima' }, ctx))).toEqual([
      'NO_SEARCHABLE_KEY',
    ])
    expect(
      codigos(validateRow(2, { full_name: 'Ana Lima', cpf: '529.982.247-25' }, ctx)),
    ).toEqual([])
  })

  it('linha com erro não ganha o aviso: o erro já a deixa de fora', () => {
    expect(
      codigos(
        validateRow(2, { full_name: 'Ana Lima', cpf: '123' }, busca({ byCpf: true })),
      ),
    ).toEqual(['CPF_INVALID'])
  })
})
