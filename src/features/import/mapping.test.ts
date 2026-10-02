import { describe, expect, it } from 'vitest'

import type { DataField } from '@/features/certificate/schema'

import {
  checkMapping,
  mappingTargets,
  normalizeHeader,
  presetFromMapping,
  suggestMapping,
  type MappingContext,
} from './mapping'

const titulo: DataField = {
  key: 'titulo_palestra',
  label: 'Título da palestra',
  type: 'text',
  required: true,
  default: null,
  format: { type: 'text', max_length: 120 },
}
const turma: DataField = {
  key: 'turma',
  label: 'Turma',
  type: 'text',
  required: true,
  default: 'Turma única',
  format: { type: 'text', max_length: 120 },
}

const contexto = (extra: Partial<MappingContext> = {}): MappingContext => ({
  multipleTypes: false,
  dataFields: [],
  preset: {},
  searchByCpf: true,
  ...extra,
})

const CABECALHO = [
  'Nome completo',
  'CPF',
  'Data de nascimento',
  'E-mail',
  'Carga horária',
]

describe('normalizeHeader', () => {
  it.each([
    ['Carga Horária', 'carga horaria'],
    ['  E-MAIL ', 'e mail'],
    ['Dt. Nasc.', 'dt nasc'],
    ['Título da palestra', 'titulo da palestra'],
    ['titulo_palestra', 'titulo palestra'],
    ['Nome   do\taluno', 'nome do aluno'],
    ['Participação', 'participacao'],
  ])('%j vira %j', (entrada, saida) => {
    expect(normalizeHeader(entrada)).toBe(saida)
  })
})

describe('mappingTargets', () => {
  it('tipo único: identidade, horas e os campos do modelo, sem alvo de tipo', () => {
    expect(mappingTargets(contexto({ dataFields: [titulo] }))).toEqual([
      'full_name',
      'cpf',
      'birth_date',
      'email',
      'hours',
      'data.titulo_palestra',
    ])
  })

  it('vários tipos: o alvo de tipo entra', () => {
    expect(mappingTargets(contexto({ multipleTypes: true }))).toContain(
      'participation_type',
    )
  })
})

describe('suggestMapping', () => {
  it('a planilha principal sai mapeada pelos sinônimos', () => {
    expect(suggestMapping(CABECALHO, contexto())).toEqual({
      full_name: 'Nome completo',
      cpf: 'CPF',
      birth_date: 'Data de nascimento',
      email: 'E-mail',
      hours: 'Carga horária',
    })
  })

  it.each([
    ['Nome do aluno', 'full_name'],
    ['Participante', 'full_name'],
    ['Documento', 'cpf'],
    ['Nascimento', 'birth_date'],
    ['Dt Nasc', 'birth_date'],
    ['Email', 'email'],
    ['Endereço de e-mail', 'email'],
    ['Horas', 'hours'],
    ['CH', 'hours'],
  ])('%j é sinônimo de %s', (cabecalho, alvo) => {
    expect(suggestMapping([cabecalho, 'Outra coisa'], contexto())).toEqual({
      [alvo]: cabecalho,
    })
  })

  it('o tipo só é sugerido no modo vários tipos', () => {
    expect(suggestMapping(['Nome', 'Tipo'], contexto())).toEqual({ full_name: 'Nome' })
    expect(
      suggestMapping(['Nome', 'Categoria'], contexto({ multipleTypes: true })),
    ).toEqual({
      full_name: 'Nome',
      participation_type: 'Categoria',
    })
  })

  it('campo do modelo casa pelo rótulo', () => {
    const ctx = contexto({ dataFields: [titulo, turma] })
    expect(suggestMapping(['Nome', 'TÍTULO DA PALESTRA', 'Turma'], ctx)).toEqual({
      full_name: 'Nome',
      'data.titulo_palestra': 'TÍTULO DA PALESTRA',
      'data.turma': 'Turma',
    })
  })

  it('campo do modelo casa pela chave, quando a planilha veio de outro sistema', () => {
    const ctx = contexto({ dataFields: [titulo] })
    expect(suggestMapping(['Nome', 'titulo_palestra'], ctx)).toEqual({
      full_name: 'Nome',
      'data.titulo_palestra': 'titulo_palestra',
    })
  })

  it('o preset do modelo vem antes do sinônimo', () => {
    // No evento passado, "Nome" era o nome do crachá e o nome completo vinha
    // de "Nome civil".
    const ctx = contexto({ preset: { full_name: 'nome civil' } })
    expect(suggestMapping(['Nome', 'Nome civil'], ctx)).toEqual({
      full_name: 'Nome civil',
    })
  })

  it('preset com cabeçalho que não está no arquivo, ou com alvo que não vale mais, é ignorado', () => {
    const ctx = contexto({
      preset: {
        full_name: 'nome civil',
        'data.campo_apagado': 'nome',
        participation_type: 'nome',
      },
    })
    expect(suggestMapping(['Nome', 'CPF'], ctx)).toEqual({
      full_name: 'Nome',
      cpf: 'CPF',
    })
  })

  it('cada coluna é sugerida para um alvo só', () => {
    const ctx = contexto({ dataFields: [{ ...titulo, key: 'nome', label: 'Nome' }] })
    expect(suggestMapping(['Nome'], ctx)).toEqual({ full_name: 'Nome' })
  })

  it('cabeçalho repetido do parse ("Nome (2)") não engana o sinônimo', () => {
    expect(suggestMapping(['Nome', 'Nome (2)'], contexto())).toEqual({
      full_name: 'Nome',
    })
  })
})

describe('checkMapping', () => {
  const tudo = {
    full_name: 'Nome completo',
    cpf: 'CPF',
    birth_date: 'Data de nascimento',
    email: 'E-mail',
    hours: 'Carga horária',
  }

  it('mapeamento completo passa sem aviso', () => {
    expect(checkMapping(tudo, CABECALHO, contexto())).toEqual({
      blocking: [],
      warnings: [],
    })
  })

  it('sem nome completo não avança', () => {
    const { full_name: _, ...semNome } = tudo
    expect(checkMapping(semNome, CABECALHO, contexto()).blocking).toEqual([
      expect.objectContaining({ code: 'TARGET_REQUIRED', target: 'full_name' }),
    ])
  })

  it('vários tipos sem a coluna de tipo não avança', () => {
    expect(
      checkMapping(tudo, CABECALHO, contexto({ multipleTypes: true })).blocking,
    ).toEqual([
      expect.objectContaining({ code: 'TARGET_REQUIRED', target: 'participation_type' }),
    ])
  })

  it('campo obrigatório do modelo sem coluna e sem valor padrão não avança; com padrão, avança', () => {
    const { blocking } = checkMapping(
      tudo,
      CABECALHO,
      contexto({ dataFields: [titulo, turma] }),
    )
    expect(blocking).toEqual([
      expect.objectContaining({
        code: 'TARGET_REQUIRED',
        target: 'data.titulo_palestra',
      }),
    ])
    expect(blocking[0]!.message).toContain('Título da palestra')
  })

  it('no modo vários tipos, o campo obrigatório fica para a validação de cada linha', () => {
    const ctx = contexto({ multipleTypes: true, dataFields: [titulo] })
    expect(
      checkMapping({ ...tudo, participation_type: 'CPF' }, CABECALHO, ctx).blocking,
    ).toEqual([])
  })

  it('sem CPF, com busca por CPF no evento, avisa e deixa avançar', () => {
    const { cpf: _, ...semCpf } = tudo
    expect(checkMapping(semCpf, CABECALHO, contexto())).toEqual({
      blocking: [],
      warnings: [
        {
          code: 'CPF_UNMAPPED',
          target: 'cpf',
          message: 'Sem CPF, estas pessoas não poderão buscar o certificado por CPF.',
        },
      ],
    })
    expect(
      checkMapping(semCpf, CABECALHO, contexto({ searchByCpf: false })).warnings,
    ).toEqual([])
  })

  it('o mapeamento vem do navegador: coluna inexistente e alvo inválido são recusados', () => {
    const { blocking } = checkMapping(
      {
        ...tudo,
        email: 'Coluna que não existe',
        participation_type: 'CPF',
        'data.inventado': 'CPF',
      },
      CABECALHO,
      contexto(),
    )
    expect(blocking.map((problema) => [problema.code, problema.target])).toEqual([
      ['UNKNOWN_HEADER', 'email'],
      ['UNKNOWN_TARGET', 'participation_type'],
      ['UNKNOWN_TARGET', 'data.inventado'],
    ])
  })
})

describe('presetFromMapping', () => {
  it('grava o cabeçalho normalizado, que é o que o próximo arquivo vai casar', () => {
    expect(
      presetFromMapping({
        full_name: 'Nome Completo',
        'data.titulo_palestra': 'Título da Palestra',
      }),
    ).toEqual({
      full_name: 'nome completo',
      'data.titulo_palestra': 'titulo da palestra',
    })
  })

  it('o preset gravado devolve o mesmo mapeamento no arquivo seguinte', () => {
    const ctx = contexto({ dataFields: [titulo] })
    const confirmado = { full_name: 'Participante', 'data.titulo_palestra': 'Tema' }
    const seguinte = ['PARTICIPANTE', 'Tema', 'Nome']
    expect(
      suggestMapping(seguinte, { ...ctx, preset: presetFromMapping(confirmado) }),
    ).toEqual({ full_name: 'PARTICIPANTE', 'data.titulo_palestra': 'Tema' })
  })
})
