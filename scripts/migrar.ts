/**
 * `pnpm db:migrar` (ADR-0018): aplica as migrations de
 * `supabase/migrations-eventos/`, em ordem, cada uma numa transação, com o
 * histórico em `eventos.schema_migrations`.
 *
 * O projeto Supabase é dividido com o CF Jobs, e o `supabase db push` opera o
 * histórico de migrations do projeto, que é do CF Jobs. Por isso este
 * repositório nunca usa `db push`, `migration repair` nem `db reset --remote`
 * contra o projeto: as migrations vão por aqui, pela CLI já logada e linkada,
 * como `postgres`, sem senha do banco na máquina. O mesmo caminho roda no
 * banco local, no `pnpm db:reset`.
 *
 * Uso:
 *   pnpm db:migrar                              banco local
 *   pnpm db:migrar --seeds-locais               banco local, e depois os dois seeds
 *   pnpm db:migrar --remote                     projeto linkado: só mostra o plano
 *   pnpm db:migrar --remote --yes               projeto linkado: aplica
 *   pnpm db:migrar --remote --yes --seed-producao   e depois o seed do sentinela
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  embrulhar,
  historicoAusente,
  lerNome,
  planejar,
  sha256,
  type Aplicada,
  type Migracao,
} from '../src/lib/migracoes'

const PASTA = path.resolve(process.cwd(), 'supabase/migrations-eventos')
const SEED_DE_PRODUCAO = 'supabase/seeds/01-producao.sql'
const SEED_DE_DESENVOLVIMENTO = 'supabase/seeds/02-dev.sql'

const opcoes = new Set(process.argv.slice(2))
const remoto = opcoes.has('--remote')
const confirmado = opcoes.has('--yes')
const temporaria = mkdtempSync(path.join(tmpdir(), 'cf-eventos-migrar-'))

class Falha extends Error {}

function falhar(mensagem: string): never {
  throw new Falha(mensagem)
}

function conferirOpcoes(): void {
  const conhecidas = ['--remote', '--yes', '--seeds-locais', '--seed-producao']
  for (const opcao of opcoes) {
    if (!conhecidas.includes(opcao)) falhar(`Opção desconhecida: ${opcao}.`)
  }
  // O seed de desenvolvimento cria contas com a senha pública `cfeventos-local`:
  // nunca no projeto remoto, e esta é a única porta por onde ele passaria.
  if (remoto && opcoes.has('--seeds-locais')) {
    falhar(
      '--seeds-locais só existe no banco local: o 02-dev.sql tem contas de senha pública.',
    )
  }
}

type Resposta = { ok: boolean; saida: string; erro: string; alvo: string }

/** Uma chamada ao `supabase db query`, com o SQL num arquivo. */
function consultar(nome: string, sql: string, extra: string[] = []): Resposta {
  const arquivo = path.join(temporaria, nome)
  writeFileSync(arquivo, sql)
  // A CLI é um script Node: chamada direto, sem shell, não há aspas a escapar
  // nem diferença entre Windows e Linux.
  const cli = path.resolve(process.cwd(), 'node_modules/supabase/dist/supabase.js')
  const argumentos = [
    cli,
    'db',
    'query',
    ...(remoto ? ['--remote'] : []),
    ...extra,
    '-f',
    arquivo,
    '--output-format',
    'json',
  ]
  const r = spawnSync(process.execPath, argumentos, { encoding: 'utf8' })
  const alvo = /Target: [^\n]+/.exec(r.stderr ?? '')?.[0] ?? ''
  return { ok: r.status === 0, saida: r.stdout ?? '', erro: r.stderr ?? '', alvo }
}

/** A mensagem do erro, que a CLI devolve em JSON (`{ "error": { "message" } }`) na saída padrão. */
function mensagemDeErro(r: Resposta): string {
  const inicio = r.saida.indexOf('{')
  if (inicio >= 0) {
    try {
      const json = JSON.parse(r.saida.slice(inicio)) as { error?: { message?: string } }
      if (json.error?.message) return json.error.message
    } catch {
      // Não era JSON: devolve o texto.
    }
  }
  return `${r.saida}${r.erro}`.trim().slice(0, 400)
}

function lerAplicadas(): { aplicadas: Aplicada[]; alvo: string } {
  const r = consultar(
    'aplicadas.sql',
    'select version, sha256 from eventos.schema_migrations order by version',
    ['--read-only'],
  )
  if (!r.ok) {
    // Banco sem o Eventos ainda: nem o schema nem o histórico existem.
    const mensagem = mensagemDeErro(r)
    if (historicoAusente(mensagem)) {
      return { aplicadas: [], alvo: r.alvo }
    }
    falhar(`Não deu para ler o histórico: ${mensagem}`)
  }
  const json = JSON.parse(r.saida.slice(r.saida.indexOf('{'))) as { rows: Aplicada[] }
  return { aplicadas: json.rows, alvo: r.alvo }
}

function lerArquivos(): Array<Migracao & { sql: string }> {
  return readdirSync(PASTA)
    .filter((nome) => nome.endsWith('.sql'))
    .map((arquivo) => {
      const sql = readFileSync(path.join(PASTA, arquivo), 'utf8')
      return { ...lerNome(arquivo), sha256: sha256(sql), sql }
    })
}

function aplicarSeed(arquivo: string): void {
  const sql = readFileSync(path.resolve(process.cwd(), arquivo), 'utf8')
  const r = consultar(path.basename(arquivo), embrulhar(sql), remoto ? ['--yes'] : [])
  if (!r.ok) falhar(`O seed ${arquivo} falhou: ${mensagemDeErro(r)}`)
  console.log(`✔ Seed ${arquivo}`)
}

function main(): void {
  conferirOpcoes()
  const arquivos = lerArquivos()
  const { aplicadas, alvo } = lerAplicadas()
  console.log(alvo || (remoto ? 'Target: projeto linkado' : 'Target: banco local'))

  const porVersao = new Map(arquivos.map((a) => [a.versao, a]))
  const pendentes = planejar(arquivos, aplicadas).pendentes.map((m) =>
    porVersao.get(m.versao)!,
  )

  console.log(
    `${aplicadas.length} aplicada(s), ${pendentes.length} pendente(s)` +
      (pendentes.length
        ? `: ${pendentes.map((m) => `${m.versao}_${m.nome}`).join(', ')}`
        : ''),
  )

  if (remoto && !confirmado) {
    console.log(
      'Nada foi aplicado. Confira o alvo e rode de novo com --yes para aplicar.',
    )
    return
  }

  for (const m of pendentes) {
    const r = consultar(`${m.versao}.sql`, embrulhar(m.sql, m), remoto ? ['--yes'] : [])
    if (!r.ok) {
      falhar(
        `A migration ${m.versao}_${m.nome} falhou e não foi aplicada (a transação desfez tudo dela): ${mensagemDeErro(r)}`,
      )
    }
    console.log(`✔ ${m.versao}_${m.nome}`)
  }

  if (opcoes.has('--seeds-locais')) {
    aplicarSeed(SEED_DE_PRODUCAO)
    aplicarSeed(SEED_DE_DESENVOLVIMENTO)
  } else if (opcoes.has('--seed-producao')) {
    aplicarSeed(SEED_DE_PRODUCAO)
  }
}

try {
  main()
} catch (erro) {
  console.error(`✖ ${(erro as Error).message}`)
  if (!(erro instanceof Falha) && !(erro as Error).message) console.error(erro)
  process.exitCode = 1
} finally {
  rmSync(temporaria, { recursive: true, force: true })
}
