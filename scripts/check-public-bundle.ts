/**
 * Guarda `public-bundle` (docs 09 e 11), depois do `pnpm build`: nenhuma rota
 * fora do admin carrega pdf.js, pdf-lib ou fontkit. São centenas de KB que o
 * celular do aluno não pode baixar; só o editor do admin os carrega, por
 * import().
 *
 * Como: cada biblioteca é reconhecida por uma string que sobrevive à
 * minificação. Um chunk que a contém está marcado; um chunk que carrega um
 * marcado por import() (`.e(id)` no webpack) também, e assim por diante. Nenhum
 * chunk estático de rota fora de /admin pode estar marcado. Pega tanto o import
 * estático quanto o import() escondido numa página pública.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const RAIZ = process.cwd()
const NEXT = path.join(RAIZ, '.next')

const BIBLIOTECAS = [
  {
    nome: 'pdfjs-dist',
    marca: 'Setting up fake worker failed',
    fonte: 'node_modules/pdfjs-dist/build/pdf.mjs',
  },
  {
    nome: '@cantoo/pdf-lib',
    marca: 'is encrypted. You can use',
    fonte: 'node_modules/@cantoo/pdf-lib/es/api/errors.js',
  },
  {
    nome: '@cantoo/fontkit',
    marca: 'Unknown font format',
    fonte: 'node_modules/@cantoo/fontkit/dist/browser-module.mjs',
  },
]

function arquivosJs(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((item) => {
    const caminho = path.join(pasta, item.name)
    if (item.isDirectory()) return arquivosJs(caminho)
    return item.name.endsWith('.js') ? [caminho] : []
  })
}

/** Chunk carregado por import(): `<id ou nome>.<hash>.js`, com o nome mapeado no runtime. */
function idsDosChunksAssincronos(runtime: string, arquivos: string[]) {
  const nomes = new Map<string, string>()
  const mapa = /\(\{([^}]*)\}\)\[\w+\]\|\|\w+\)/.exec(runtime)?.[1] ?? ''
  for (const [, id, nome] of mapa.matchAll(/(\d+):"([^"]+)"/g)) nomes.set(nome!, id!)

  const ids = new Map<string, string>()
  for (const arquivo of arquivos) {
    const casado = /^([\w-]+)\.[0-9a-f]+\.js$/.exec(path.basename(arquivo))
    if (casado) ids.set(arquivo, nomes.get(casado[1]!) ?? casado[1]!)
  }
  return ids
}

function rotasForaDoAdmin() {
  const manifestos = arquivosJs(path.join(NEXT, 'server', 'app')).filter((arquivo) =>
    arquivo.endsWith('_client-reference-manifest.js'),
  )
  const globalComManifesto = globalThis as {
    __RSC_MANIFEST?: Record<
      string,
      { clientModules: Record<string, { chunks: string[] }> }
    >
  }
  const rotas = new Map<string, Set<string>>()
  for (const manifesto of manifestos) {
    const relativo = path.relative(path.join(NEXT, 'server', 'app'), manifesto)
    if (relativo.split(path.sep)[0] === 'admin') continue
    globalComManifesto.__RSC_MANIFEST = {}
    ;(globalThis as { self?: unknown }).self = globalThis
    // O manifesto é um script que se escreve em globalThis.__RSC_MANIFEST.
    new Function(readFileSync(manifesto, 'utf8'))()
    for (const [rota, dados] of Object.entries(globalComManifesto.__RSC_MANIFEST)) {
      const chunks = Object.values(dados.clientModules).flatMap((modulo) =>
        modulo.chunks.filter((chunk) => chunk.startsWith('static/')),
      )
      // O manifesto guarda o caminho como URL: `[slug]` vem como `%5Bslug%5D`.
      // Sem decodificar, toda rota com parâmetro escapava do guarda (medido no M6).
      rotas.set(
        rota,
        new Set(chunks.map((chunk) => path.join(NEXT, decodeURIComponent(chunk)))),
      )
    }
  }
  return rotas
}

function main(): void {
  const problemas: string[] = []

  // Atualização que mude a string faria o guarda passar sem ver nada.
  for (const biblioteca of BIBLIOTECAS) {
    const fonte = path.join(RAIZ, biblioteca.fonte)
    if (!existsSync(fonte) || !readFileSync(fonte, 'utf8').includes(biblioteca.marca)) {
      problemas.push(
        `${biblioteca.nome}: a marca "${biblioteca.marca}" sumiu de ${biblioteca.fonte}. Atualize o guarda.`,
      )
    }
  }

  const pastaDosChunks = path.join(NEXT, 'static', 'chunks')
  if (!existsSync(pastaDosChunks)) {
    console.error('✖ Sem .next/static/chunks. Rode `pnpm build` antes.')
    process.exit(1)
  }
  const arquivos = arquivosJs(pastaDosChunks)
  const conteudo = new Map(
    arquivos.map((arquivo) => [arquivo, readFileSync(arquivo, 'utf8')]),
  )
  const runtime =
    [...conteudo].find(([arquivo]) =>
      path.basename(arquivo).startsWith('webpack-'),
    )?.[1] ?? ''
  const ids = idsDosChunksAssincronos(runtime, arquivos)

  // Marcados: contêm a biblioteca, ou carregam por import() quem contém.
  const marcados = new Map<string, string>()
  for (const [arquivo, texto] of conteudo) {
    const biblioteca = BIBLIOTECAS.find((b) => texto.includes(b.marca))
    if (biblioteca) marcados.set(arquivo, biblioteca.nome)
  }
  for (let mudou = true; mudou;) {
    mudou = false
    const idsMarcados = new Map(
      [...marcados].flatMap(([arquivo, nome]) =>
        ids.has(arquivo) ? [[ids.get(arquivo)!, nome]] : [],
      ),
    )
    for (const [arquivo, texto] of conteudo) {
      if (marcados.has(arquivo)) continue
      for (const [, id] of texto.matchAll(/\b\w\.e\((\d+)\)/g)) {
        if (idsMarcados.has(id!)) {
          marcados.set(arquivo, `${idsMarcados.get(id!)} por import()`)
          mudou = true
          break
        }
      }
    }
  }

  const rotas = rotasForaDoAdmin()
  if (rotas.size === 0)
    problemas.push('Nenhuma rota fora do admin no build. Rode `pnpm build` antes.')
  for (const [rota, chunks] of rotas) {
    for (const chunk of chunks) {
      // Caminho que não bate com o disco seria pulado em silêncio.
      if (!conteudo.has(chunk)) {
        problemas.push(
          `${rota}: o manifesto aponta para ${path.relative(NEXT, chunk)}, que não existe.`,
        )
        continue
      }
      const nome = marcados.get(chunk)
      if (nome) problemas.push(`${rota}: ${path.relative(NEXT, chunk)} traz ${nome}.`)
    }
  }

  if (problemas.length > 0) {
    console.error('✖ Guarda public-bundle com problema\n')
    for (const problema of problemas) console.error(`  ${problema}`)
    console.error(
      '\nNa área pública, pdf.js, pdf-lib e fontkit só rodam no servidor (doc 09).',
    )
    process.exit(1)
  }

  console.log(
    `✔ ${rotas.size} rotas fora do admin sem pdf.js, pdf-lib nem fontkit (${marcados.size} chunks com eles, nenhum nessas rotas).`,
  )
}

main()
