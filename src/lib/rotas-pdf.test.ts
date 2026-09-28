// @vitest-environment node

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ROTAS_QUE_GERAM_PDF } from './rotas-pdf'

const APP = path.resolve(process.cwd(), 'src/app')

/** `src/app/(public)/x/route.ts` → `/x`: grupos de rota não entram no caminho. */
function rotaDoArquivo(arquivo: string): string {
  const partes = path
    .relative(APP, path.dirname(arquivo))
    .split(path.sep)
    .filter((parte) => !/^\(.*\)$/.test(parte))
  return `/${partes.join('/')}`
}

function arquivosDeRota(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(pasta, entrada.name)
    if (entrada.isDirectory()) return arquivosDeRota(caminho)
    return entrada.name === 'route.ts' ? [caminho] : []
  })
}

describe('rotas que geram PDF', () => {
  it('toda rota da lista existe em src/app', () => {
    const existentes = arquivosDeRota(APP).map(rotaDoArquivo)
    for (const rota of ROTAS_QUE_GERAM_PDF) {
      expect(existentes, rota).toContain(rota)
    }
  })

  // Rota nova que gera PDF sem estar na lista funcionaria no `pnpm dev` e
  // sairia sem fonte no deploy: a armadilha 14 do doc 14.
  it('toda rota que chama o motor está na lista', () => {
    const geramPdf = arquivosDeRota(APP)
      .filter((arquivo) =>
        readFileSync(arquivo, 'utf8').includes('generateCertificatePdf'),
      )
      .map(rotaDoArquivo)

    expect(geramPdf.length).toBeGreaterThan(0)
    expect([...ROTAS_QUE_GERAM_PDF].sort()).toEqual(geramPdf.sort())
  })
})
