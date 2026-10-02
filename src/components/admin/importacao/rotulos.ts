/** Os nomes que a tela usa para o que a importação devolve (doc 06). */

export const ROTULO_DA_ACAO = {
  create: 'A criar',
  update: 'A atualizar',
  unchanged: 'Inalterada',
  error: 'Com erro',
  needs_decision: 'Pede decisão',
  skipped: 'Pulada',
} as const

export type AcaoDaLinha = keyof typeof ROTULO_DA_ACAO

export const FILTROS_DA_PREVIA = [
  { valor: 'all', rotulo: 'Todas' },
  { valor: 'needs_decision', rotulo: 'Pedem decisão' },
  { valor: 'error', rotulo: 'Com erro' },
  { valor: 'warning', rotulo: 'Com aviso' },
  { valor: 'create', rotulo: 'A criar' },
  { valor: 'update', rotulo: 'A atualizar' },
  { valor: 'skipped', rotulo: 'Puladas' },
  { valor: 'unchanged', rotulo: 'Inalteradas' },
] as const

export type FiltroDaPrevia = (typeof FILTROS_DA_PREVIA)[number]['valor']

export const ROTULO_DO_ENCODING = {
  'utf-8': 'UTF-8',
  'utf-8-bom': 'UTF-8 com BOM',
  'utf-16le': 'Texto Unicode (UTF-16)',
  'utf-16be': 'Texto Unicode (UTF-16)',
  'windows-1252': 'Windows (Excel em português)',
} as const

export const ROTULO_DO_DELIMITADOR = {
  ';': 'ponto e vírgula',
  ',': 'vírgula',
  '\t': 'tabulação',
  '|': 'barra vertical',
} as const

export const ROTULO_DO_AVISO: Record<string, string> = {
  HOMONYM_IN_EVENT: 'homônimos no evento',
  NAME_SINGLE_WORD: 'nomes de uma palavra só',
  NO_SEARCHABLE_KEY: 'pessoas sem dado de busca',
  FIELD_NOT_IN_TEMPLATE: 'valores ignorados por não caberem no modelo',
  CERTIFICATE_REVOKED: 'certificados revogados',
  LAYOUT_BELOW_MIN_SIZE: 'nomes que ficam pequenos demais no modelo',
}

/** Os campos que a tela compara no antes e depois. */
export const CAMPOS_COMPARADOS = [
  { chave: 'fullName', rotulo: 'Nome' },
  { chave: 'email', rotulo: 'E-mail' },
  { chave: 'birthDate', rotulo: 'Nascimento' },
  { chave: 'cpf', rotulo: 'CPF' },
  { chave: 'hours', rotulo: 'Carga horária' },
] as const
