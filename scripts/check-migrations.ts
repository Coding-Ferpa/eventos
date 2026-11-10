/**
 * Gate de expand/contract nas migrations, herdado do CF Jobs.
 *
 * A regra: toda migration precisa ser compatível com o deploy anterior,
 * porque as migrations rodam antes do deploy novo. Existe uma janela em que o
 * código velho fala com o banco novo, e coluna removida nessa janela é erro
 * 500 em produção, não erro de build.
 *
 * O script procura comandos que quebram o deploy anterior e exige que o autor
 * declare a fase no próprio arquivo:
 *
 *   -- expand/contract: contract (a coluna saiu do código no deploy X)
 *
 * O marcador não é burocracia: ele obriga a olhar se o código que usava aquilo
 * já saiu do ar. Antes do primeiro deploy (M9) não existe deploy anterior, e o
 * gate só passa a morder de verdade dali em diante.
 *
 * Uso: `pnpm check:migrations` (todas) ou com caminhos como argumento.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PASTA = resolve(process.cwd(), 'supabase/migrations-eventos')

const MARCADOR = /--\s*expand\/contract:\s*(expand|contract)\b/i

type Regra = { nome: string; padrao: RegExp }

/**
 * Só comandos que **derrubam o deploy anterior**. `create`, `alter ... add
 * column` com default e `create index` são expand por natureza e não entram na
 * lista: travá-los transformaria o gate em ruído, e gate ruidoso vira
 * `--no-verify`.
 */
const REGRAS: Regra[] = [
  { nome: 'drop table', padrao: /\bdrop\s+table\b/i },
  { nome: 'drop column', padrao: /\bdrop\s+column\b/i },
  { nome: 'drop function', padrao: /\bdrop\s+function\b/i },
  { nome: 'drop view', padrao: /\bdrop\s+view\b/i },
  { nome: 'drop type', padrao: /\bdrop\s+type\b/i },
  { nome: 'rename', padrao: /\brename\s+(to|column)\b/i },
  { nome: 'alteração de tipo de coluna', padrao: /\balter\s+column\b[^;]*\btype\b/i },
  { nome: 'set not null', padrao: /\bset\s+not\s+null\b/i },
]

/** Comentário não é comando: `-- drop table` não derruba nada. */
function semComentarios(sql: string): string {
  return sql
    .split('\n')
    .map((linha) => linha.replace(/--.*$/, ''))
    .join('\n')
}

function conferir(caminho: string): string[] {
  const bruto = readFileSync(caminho, 'utf8')
  if (MARCADOR.test(bruto)) return []

  const sql = semComentarios(bruto)

  return REGRAS.filter((regra) => regra.padrao.test(sql)).map(
    (regra) => `${caminho}: ${regra.nome}`,
  )
}

function main(): void {
  const alvos =
    process.argv.length > 2
      ? process.argv.slice(2)
      : readdirSync(PASTA)
          .filter((nome) => nome.endsWith('.sql'))
          .map((nome) => join('supabase/migrations-eventos', nome))

  const problemas = alvos.flatMap(conferir)

  if (problemas.length > 0) {
    console.error('✖ Migration com comando destrutivo e sem declaração de fase:\n')
    for (const problema of problemas) console.error(`  ${problema}`)
    console.error(
      '\nAs migrations rodam antes do deploy novo: existe uma janela em que o\n' +
        'código anterior fala com o banco já migrado. Se o comando é\n' +
        'seguro nessa janela, declare no arquivo por quê:\n\n' +
        '  -- expand/contract: contract (a view saiu do código no deploy X)\n',
    )
    process.exit(1)
  }

  console.log(`✔ ${alvos.length} migrations conferidas (expand/contract).`)
}

main()
