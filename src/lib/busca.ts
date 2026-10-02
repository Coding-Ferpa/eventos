import { isValidCpf } from './cpf'
import { dataParaIso } from './mascaras'

/**
 * As regras do formulário de busca do certificado (docs 03, 6b, e 07). A API
 * confere tudo de novo; conferir aqui antes poupa uma tentativa do rate limit
 * a quem só errou a digitação.
 */

/** A configuração da busca do evento (doc 04): é do evento, e não de pessoa. */
export type ConfiguracaoDaBusca = {
  mode: 'any' | 'all'
  byCpf: boolean
  byEmail: boolean
  byName: boolean
  birthDateRequired: boolean
}

export type MetodoDaBusca = 'cpf' | 'email' | 'name'
export type CampoDaBusca = 'cpf' | 'email' | 'full_name' | 'birth_date'

export const CPF_INVALIDO = 'Esse CPF não parece válido. Confira os números.'

export function metodosDisponiveis(config: ConfiguracaoDaBusca): MetodoDaBusca[] {
  if (config.mode === 'all') return []
  const ligados: [MetodoDaBusca, boolean][] = [
    ['cpf', config.byCpf],
    ['email', config.byEmail],
    ['name', config.byName],
  ]
  return ligados.filter(([, ligado]) => ligado).map(([metodo]) => metodo)
}

export function camposDoMetodo(
  config: ConfiguracaoDaBusca,
  metodo: MetodoDaBusca | 'all',
): CampoDaBusca[] {
  const usa = (m: MetodoDaBusca, ligado: boolean) =>
    metodo === m || (metodo === 'all' && ligado)
  const campos: CampoDaBusca[] = []
  if (usa('cpf', config.byCpf)) campos.push('cpf')
  if (usa('email', config.byEmail)) campos.push('email')
  if (usa('name', config.byName)) {
    // A data de nascimento nunca é chave sozinha (ADR-0009).
    campos.push('full_name')
    if (config.birthDateRequired) campos.push('birth_date')
  }
  return campos
}

export function conferirCampo(
  campo: CampoDaBusca,
  valor: string,
  hoje: Date = new Date(),
): string | null {
  const limpo = valor.trim()
  switch (campo) {
    case 'cpf': {
      const digitos = limpo.replace(/\D/g, '')
      if (!digitos) return 'Digite o CPF.'
      return isValidCpf(digitos) ? null : CPF_INVALIDO
    }
    case 'email':
      if (!limpo) return 'Digite o e-mail.'
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpo)
        ? null
        : 'Esse e-mail parece incompleto. Confira.'
    case 'full_name':
      return limpo.length >= 3 ? null : 'Digite o nome completo.'
    case 'birth_date':
      if (!limpo) return 'Digite a data de nascimento.'
      return dataParaIso(limpo, hoje)
        ? null
        : 'Essa data não existe. Use dia, mês e ano, como 15/03/2004.'
  }
}

/** O corpo do `POST /api/certificados/buscar` (doc 07), só com os campos do método. */
export function corpoDaBusca(
  slug: string,
  metodo: MetodoDaBusca | 'all',
  campos: CampoDaBusca[],
  valores: Partial<Record<CampoDaBusca, string>>,
): Record<string, string> {
  const corpo: Record<string, string> = { event_slug: slug, method: metodo }
  for (const campo of campos) {
    const valor = (valores[campo] ?? '').trim()
    corpo[campo] = campo === 'birth_date' ? (dataParaIso(valor) ?? valor) : valor
  }
  return corpo
}
