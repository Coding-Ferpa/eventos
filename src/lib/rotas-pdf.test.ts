// @vitest-environment node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ROTAS_QUE_LEEM_AS_FONTES } from './rotas-pdf'

const SRC = path.resolve(process.cwd(), 'src')
const APP = path.join(SRC, 'app')
const ASSETS = path.join(SRC, 'lib', 'certificate-assets.ts')

/** `src/app/(public)/x/page.tsx` → `/x`: grupos de rota não entram no caminho. */
function rotaDoArquivo(arquivo: string): string {
  const partes = path
    .relative(APP, path.dirname(arquivo))
    .split(path.sep)
    .filter((parte) => parte && !/^\(.*\)$/.test(parte))
  return `/${partes.join('/')}`
}

function arquivosDeRota(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(pasta, entrada.name)
    if (entrada.isDirectory()) return arquivosDeRota(caminho)
    return /^(page\.tsx?|route\.ts)$/.test(entrada.name) ? [caminho] : []
  })
}

function resolver(de: string, alvo: string): string | null {
  const base = alvo.startsWith('@/')
    ? path.join(SRC, alvo.slice(2))
    : alvo.startsWith('.')
      ? path.resolve(path.dirname(de), alvo)
      : null
  if (!base) return null
  for (const sufixo of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidato = base + sufixo
    if (existsSync(candidato) && statSync(candidato).isFile()) return candidato
  }
  return null
}

// `import type` some no build e não puxa o módulo para o pacote.
const IMPORT =
  /(?:^|\n)\s*(import|export)(?!\s+type\s)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

// Os imports de cada arquivo, lidos uma vez só: sem isto, cada rota relia e
// resolvia o grafo inteiro de novo, e o teste passava de 1,8 s, a caminho dos
// 5 s do runner do CI, que é umas três vezes mais lento aqui.
const importsDe = new Map<string, string[]>()
function destinos(arquivo: string): string[] {
  let lista = importsDe.get(arquivo)
  if (!lista) {
    lista = [...readFileSync(arquivo, 'utf8').matchAll(IMPORT)]
      .map((casamento) => resolver(arquivo, casamento[2] ?? casamento[3]!))
      .filter((destino): destino is string => destino !== null)
    importsDe.set(arquivo, lista)
  }
  return lista
}

/**
 * O grafo de imports do arquivo alcança o `certificate-assets`, que lê as
 * fontes do disco? Server Action referenciada por componente cliente roda
 * dentro da função da página que o usa, então o caminho atravessa o cliente.
 */
function alcancaAsFontes(arquivo: string, vistos = new Set<string>()): boolean {
  if (arquivo === ASSETS) return true
  if (vistos.has(arquivo)) return false
  vistos.add(arquivo)
  return destinos(arquivo).some((destino) => alcancaAsFontes(destino, vistos))
}

describe('rotas que leem as fontes do disco', () => {
  it('toda rota da lista existe em src/app', () => {
    const existentes = arquivosDeRota(APP).map(rotaDoArquivo)
    for (const rota of ROTAS_QUE_LEEM_AS_FONTES) expect(existentes, rota).toContain(rota)
  })

  // Rota nova que lê fonte sem estar na lista funcionaria no `pnpm dev` e
  // sairia sem fonte no deploy: a armadilha 14 do doc 14. Medido no M8: a
  // checagem antiga só olhava `route.ts` com `generateCertificatePdf`, e o
  // editor do M6 e a prévia da importação do M7 ficaram de fora.
  it('toda página ou rota cujo grafo alcança o certificate-assets está na lista', () => {
    const leem = arquivosDeRota(APP)
      .filter((arquivo) => alcancaAsFontes(arquivo))
      .map(rotaDoArquivo)
    expect(leem.length).toBeGreaterThan(0)
    expect([...ROTAS_QUE_LEEM_AS_FONTES].sort()).toEqual([...new Set(leem)].sort())
  })
})
