import type { DataField } from '@/features/certificate/schema'

/**
 * Passo 2 da importação (doc 06): cada alvo recebe uma coluna do arquivo ou
 * "não importar". A sugestão nunca é aplicada sem o admin ver; o que o
 * servidor confia é o `checkMapping`, porque o mapeamento volta do navegador.
 */

export type IdentityTarget = 'full_name' | 'cpf' | 'birth_date' | 'email'
export type SystemTarget = 'participation_type' | 'hours'
export type DataTarget = `data.${string}`
export type Target = IdentityTarget | SystemTarget | DataTarget

/** Alvo → cabeçalho do arquivo, como saiu do parse. Alvo ausente é "não importar". */
export type Mapping = Partial<Record<Target, string>>

/** O formato de `certificate_templates.column_mapping`: alvo → cabeçalho normalizado. */
export type MappingPreset = Record<string, string>

export type MappingContext = {
  /** Planilha com coluna de tipo. No tipo único, o lote inteiro é de um tipo. */
  multipleTypes: boolean
  /** Do modelo do tipo; no modo vários tipos, a união por chave dos modelos do evento. */
  dataFields: DataField[]
  preset: MappingPreset
  searchByCpf: boolean
}

export type MappingIssueCode =
  'TARGET_REQUIRED' | 'UNKNOWN_HEADER' | 'UNKNOWN_TARGET' | 'CPF_UNMAPPED'
export type MappingIssue = { code: MappingIssueCode; target: Target; message: string }

/**
 * Sem acento, minúsculas, pontuação vira espaço (doc 06). Não é a
 * `normalize_person_name`: cabeçalho e tipo só se comparam entre si aqui, nunca
 * com valor do banco, e nome de pessoa tem fonte única no SQL.
 */
export function normalizeHeader(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const SINONIMOS: Record<IdentityTarget | SystemTarget, string[]> = {
  // "nome do participante" e "endereço de e-mail" são os cabeçalhos do Google
  // Forms, que é de onde a lista de inscrição costuma sair.
  full_name: [
    'nome',
    'nome completo',
    'nome do aluno',
    'nome do participante',
    'participante',
  ],
  cpf: ['cpf', 'documento'],
  birth_date: ['nascimento', 'data de nascimento', 'dt nasc'],
  email: ['e mail', 'email', 'endereco de e mail'],
  participation_type: ['tipo', 'categoria', 'participacao'],
  hours: ['carga horaria', 'horas', 'ch'],
}

const ROTULOS: Record<IdentityTarget | SystemTarget, string> = {
  full_name: 'Nome completo',
  cpf: 'CPF',
  birth_date: 'Data de nascimento',
  email: 'E-mail',
  participation_type: 'Tipo de participação',
  hours: 'Carga horária',
}

const alvoDoCampo = (campo: DataField): DataTarget => `data.${campo.key}`

export function mappingTargets(ctx: MappingContext): Target[] {
  return [
    'full_name',
    'cpf',
    'birth_date',
    'email',
    ...(ctx.multipleTypes ? (['participation_type'] as const) : []),
    'hours',
    ...ctx.dataFields.map(alvoDoCampo),
  ]
}

export function targetLabel(alvo: Target, ctx: MappingContext): string {
  if (alvo.startsWith('data.')) {
    return ctx.dataFields.find((campo) => alvoDoCampo(campo) === alvo)?.label ?? alvo
  }
  return ROTULOS[alvo as IdentityTarget | SystemTarget]
}

/** Preset do modelo, depois sinônimos, depois rótulo e chave dos campos. */
export function suggestMapping(headers: string[], ctx: MappingContext): Mapping {
  const normalizados = headers.map(normalizeHeader)
  const validos = new Set<Target>(mappingTargets(ctx))
  const usados = new Set<number>()
  const sugestao: Mapping = {}

  const atribuir = (alvo: Target, candidatos: string[]) => {
    if (!validos.has(alvo) || sugestao[alvo] !== undefined) return
    for (const candidato of candidatos) {
      const indice = normalizados.findIndex((h, i) => h === candidato && !usados.has(i))
      if (indice >= 0) {
        sugestao[alvo] = headers[indice]
        usados.add(indice)
        return
      }
    }
  }

  for (const [alvo, cabecalho] of Object.entries(ctx.preset))
    atribuir(alvo as Target, [cabecalho])
  for (const [alvo, sinonimos] of Object.entries(SINONIMOS))
    atribuir(alvo as Target, sinonimos)
  for (const campo of ctx.dataFields) {
    atribuir(alvoDoCampo(campo), [
      normalizeHeader(campo.label),
      normalizeHeader(campo.key),
    ])
  }
  return sugestao
}

export function checkMapping(
  mapping: Mapping,
  headers: string[],
  ctx: MappingContext,
): { blocking: MappingIssue[]; warnings: MappingIssue[] } {
  const blocking: MappingIssue[] = []
  const warnings: MappingIssue[] = []
  const validos = new Set<Target>(mappingTargets(ctx))

  for (const [chave, cabecalho] of Object.entries(mapping)) {
    const alvo = chave as Target
    if (!validos.has(alvo)) {
      blocking.push({
        code: 'UNKNOWN_TARGET',
        target: alvo,
        message: `O campo ${alvo} não existe neste modelo.`,
      })
    } else if (cabecalho === undefined || !headers.includes(cabecalho)) {
      blocking.push({
        code: 'UNKNOWN_HEADER',
        target: alvo,
        message: `A coluna escolhida para ${targetLabel(alvo, ctx)} não está no arquivo.`,
      })
    }
  }

  const exigir = (alvo: Target) => {
    if (mapping[alvo] === undefined) {
      blocking.push({
        code: 'TARGET_REQUIRED',
        target: alvo,
        message: `Escolha a coluna de ${targetLabel(alvo, ctx)}.`,
      })
    }
  }
  exigir('full_name')
  if (ctx.multipleTypes) {
    exigir('participation_type')
  } else {
    // No modo vários tipos o campo obrigatório depende do tipo de cada linha,
    // e quem acusa é a validação da linha (FIELD_REQUIRED).
    for (const campo of ctx.dataFields) {
      if (campo.required && campo.default === null) exigir(alvoDoCampo(campo))
    }
  }

  if (ctx.searchByCpf && mapping.cpf === undefined) {
    warnings.push({
      code: 'CPF_UNMAPPED',
      target: 'cpf',
      message: 'Sem CPF, estas pessoas não poderão buscar o certificado por CPF.',
    })
  }
  return { blocking, warnings }
}

export function presetFromMapping(mapping: Mapping): MappingPreset {
  return Object.fromEntries(
    Object.entries(mapping)
      .filter((entrada): entrada is [string, string] => entrada[1] !== undefined)
      .map(([alvo, cabecalho]) => [alvo, normalizeHeader(cabecalho)]),
  )
}
