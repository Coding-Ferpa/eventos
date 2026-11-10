import { createHash } from 'node:crypto'

/**
 * A lógica do `pnpm db:migrar` (ADR-0018), sem banco e sem CLI. O Eventos
 * divide o projeto Supabase com o CF Jobs, e o histórico de migrations da CLI
 * é do projeto: por isso as migrations daqui moram fora de
 * `supabase/migrations` (em `supabase/migrations-eventos`) e têm histórico próprio, em `eventos.schema_migrations`.
 *
 * A CLI só executa uma instrução por chamada; cada migration vai inteira
 * dentro de um bloco `do`, que é uma instrução só e roda numa transação:
 * falhou no meio, nada fica aplicado.
 */

export type Migracao = { versao: string; nome: string; sha256: string }
export type Aplicada = { version: string; sha256: string }

const PADRAO_DO_NOME = /^(\d{4})_([a-z0-9_]+)\.sql$/
const DELIMITADORES = ['$migracao_eventos$', '$sql_eventos$']

export function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex')
}

export function lerNome(arquivo: string): { versao: string; nome: string } {
  const m = PADRAO_DO_NOME.exec(arquivo)
  if (!m) {
    throw new Error(
      `${arquivo} não segue o padrão 0000_nome.sql (quatro dígitos, minúsculas e _).`,
    )
  }
  return { versao: m[1]!, nome: m[2]! }
}

/**
 * O que falta aplicar, na ordem. Recusa, em vez de adivinhar, os três casos em
 * que seguir corromperia o banco: migration aplicada que mudou de conteúdo,
 * banco com migration que o repositório não tem, e migration nova com versão
 * anterior à última aplicada (ela rodaria fora de ordem).
 */
export function planejar(
  arquivos: Migracao[],
  aplicadas: Aplicada[],
): { pendentes: Migracao[] } {
  const ordenadas = [...arquivos].sort((a, b) => a.versao.localeCompare(b.versao))
  const porVersao = new Map(ordenadas.map((m) => [m.versao, m]))

  for (const aplicada of aplicadas) {
    const arquivo = porVersao.get(aplicada.version)
    if (!arquivo) {
      throw new Error(
        `O banco tem a migration ${aplicada.version}, que não existe neste repositório.`,
      )
    }
    if (arquivo.sha256 !== aplicada.sha256) {
      throw new Error(
        `A migration ${aplicada.version} mudou depois de aplicada. Migration aplicada não se edita: crie uma nova.`,
      )
    }
  }

  const feitas = new Set(aplicadas.map((a) => a.version))
  const ultima = [...feitas].sort().at(-1)
  const pendentes = ordenadas.filter((m) => !feitas.has(m.versao))
  const foraDeOrdem = pendentes.find((m) => ultima !== undefined && m.versao < ultima)
  if (foraDeOrdem) {
    throw new Error(
      `A migration ${foraDeOrdem.versao} é anterior à última aplicada (${ultima}). Renumere para depois dela.`,
    )
  }
  return { pendentes }
}

/**
 * O bloco que a CLI executa. Com `registro`, é migration: trava, confere que a
 * versão ainda não foi aplicada (outra execução pode ter chegado antes),
 * executa e grava no histórico, tudo na mesma transação. Sem, é seed.
 */
export function embrulhar(sql: string, registro?: Migracao): string {
  for (const delimitador of DELIMITADORES) {
    if (sql.includes(delimitador)) {
      throw new Error(
        `O SQL usa ${delimitador}, que é o delimitador do bloco da migração.`,
      )
    }
  }
  if (!registro) {
    return `do $migracao_eventos$\nbegin\n  execute $sql_eventos$\n${sql}\n$sql_eventos$;\nend\n$migracao_eventos$;\n`
  }

  if (!/^\d{4}$/.test(registro.versao) || !/^[a-z0-9_]+$/.test(registro.nome)) {
    throw new Error('Versão ou nome de migration fora do padrão.')
  }
  if (!/^[0-9a-f]+$/.test(registro.sha256)) throw new Error('sha256 inválido.')

  return [
    'do $migracao_eventos$',
    'begin',
    "  perform pg_advisory_xact_lock(hashtext('cf-eventos:migrar'));",
    "  if to_regclass('eventos.schema_migrations') is not null then",
    `    if exists (select 1 from eventos.schema_migrations where version = '${registro.versao}') then`,
    `      raise exception 'A migration ${registro.versao} já foi aplicada por outra execução.';`,
    '    end if;',
    '  end if;',
    `  execute $sql_eventos$\n${sql}\n$sql_eventos$;`,
    `  insert into eventos.schema_migrations (version, name, sha256) values ('${registro.versao}', '${registro.nome}', '${registro.sha256}');`,
    'end',
    '$migracao_eventos$;',
    '',
  ].join('\n')
}
