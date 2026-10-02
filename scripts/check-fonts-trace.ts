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

import { ROTAS_QUE_LEEM_AS_FONTES } from '../src/lib/rotas-pdf'

const RAIZ = process.cwd()
const PASTA_DAS_FONTES = path.join(RAIZ, 'public', 'fonts', 'cert')
const APP_DO_BUILD = path.join(RAIZ, '.next', 'server', 'app')

/**
 * Rastro por caminho de rota. Rota de API tem `route.js`; página tem `page.js`
 * (e as Server Actions dela). O build guarda o grupo de rota na pasta
 * (`(public)/eventos/...`), e o caminho da rota não o tem.
 */
function rastrosDoBuild(pasta = APP_DO_BUILD, mapa = new Map<string, string>()) {
  if (!existsSync(pasta)) return mapa
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, entrada.name)
    if (entrada.isDirectory()) rastrosDoBuild(caminho, mapa)
    else if (
      entrada.name === 'route.js.nft.json' ||
      entrada.name === 'page.js.nft.json'
    ) {
      const rota = path
        .relative(APP_DO_BUILD, pasta)
        .split(path.sep)
        .filter((parte) => parte && !/^\(.*\)$/.test(parte))
      mapa.set(`/${rota.join('/')}`, caminho)
    }
  }
  return mapa
}

function main(): void {
  const fontes = readdirSync(PASTA_DAS_FONTES).filter((arquivo) =>
    arquivo.endsWith('.ttf'),
  )
  const problemas: string[] = []
  const rastros = rastrosDoBuild()

  for (const rota of ROTAS_QUE_LEEM_AS_FONTES) {
    const rastro = rastros.get(rota)
    if (!rastro) {
      problemas.push(`${rota}: sem rastro no build. Rode \`pnpm build\` antes.`)
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
    `✔ ${fontes.length} fontes no pacote de ${ROTAS_QUE_LEEM_AS_FONTES.length} página(s) e rota(s) que leem fontes.`,
  )
}

main()
