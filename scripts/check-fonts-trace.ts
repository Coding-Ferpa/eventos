/**
 * Confere, depois do `pnpm build`, que toda TTF de `public/fonts/cert/` está
 * no rastro (`.nft.json`) de cada rota que gera PDF (doc 05). Fonte que existe
 * no `pnpm dev` e some no deploy é a armadilha 14 do doc 14: aqui ela vira
 * erro de CI, e não certificado quebrado em produção.
 *
 * Confere também o contrário: `.env` e `.git/` fora do rastro. Medido no M5:
 * quando o caminho lido do disco é `process.cwd()` mais um valor que o nft não
 * avalia, ele traça o projeto inteiro para dentro da função, segredos
 * inclusive, e as fontes "chegam" junto com todo o resto.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { ROTAS_QUE_GERAM_PDF } from '../src/lib/rotas-pdf'

const RAIZ = process.cwd()
const PASTA_DAS_FONTES = path.join(RAIZ, 'public', 'fonts', 'cert')

function main(): void {
  const fontes = readdirSync(PASTA_DAS_FONTES).filter((arquivo) =>
    arquivo.endsWith('.ttf'),
  )
  const problemas: string[] = []

  for (const rota of ROTAS_QUE_GERAM_PDF) {
    const rastro = path.join(
      RAIZ,
      '.next',
      'server',
      'app',
      ...rota.split('/'),
      'route.js.nft.json',
    )
    if (!existsSync(rastro)) {
      problemas.push(
        `${rota}: sem rastro em ${path.relative(RAIZ, rastro)}. Rode \`pnpm build\` antes.`,
      )
      continue
    }

    // Os caminhos do rastro são relativos ao próprio arquivo .nft.json.
    const { files } = JSON.parse(readFileSync(rastro, 'utf8')) as { files: string[] }
    const rastreados = new Set(
      files.map((arquivo) => path.resolve(path.dirname(rastro), arquivo)),
    )
    const faltando = fontes.filter(
      (fonte) => !rastreados.has(path.join(PASTA_DAS_FONTES, fonte)),
    )
    if (faltando.length > 0) {
      problemas.push(`${rota}: fora do pacote da função: ${faltando.join(', ')}`)
    }
    const vazados = [...rastreados]
      .map((arquivo) => path.relative(RAIZ, arquivo).split(path.sep).join('/'))
      .filter((arquivo) => /^\.env|^\.git\//.test(arquivo))
    if (vazados.length > 0) {
      problemas.push(
        `${rota}: o rastro traz o projeto para dentro da função (${vazados.slice(0, 3).join(', ')}, ...). ` +
          'O caminho lido do disco precisa ser estático.',
      )
    }
  }

  if (problemas.length > 0) {
    console.error('✖ Rastro das rotas de PDF com problema\n')
    for (const problema of problemas) console.error(`  ${problema}`)
    console.error(
      '\nRota que gera PDF entra em src/lib/rotas-pdf.ts, que o next.config põe em ' +
        'outputFileTracingIncludes; e o caminho das fontes no código precisa ser estático.',
    )
    process.exit(1)
  }

  console.log(
    `✔ ${fontes.length} fontes no pacote de ${ROTAS_QUE_GERAM_PDF.length} rota(s) de PDF.`,
  )
}

main()
