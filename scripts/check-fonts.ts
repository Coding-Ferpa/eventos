/**
 * Confere as fontes curadas do certificado (docs 11 e 12): toda fonte do
 * catálogo existe em `public/fonts/cert/` e todo TTF da pasta está no
 * catálogo; nenhuma é variável (tabela `fvar`); o peso declarado no catálogo
 * é o do arquivo; todas cobrem os caracteres do português; cada família tem
 * licença em `LICENSES/`, e cada arquivo tem linha no THIRD_PARTY_NOTICES.md.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { CURATED_FONTS } from '../src/features/certificate/fonts/catalog'
import { checkCoverage, isVariableFont } from '../src/features/certificate/fonts/coverage'
import { loadFont } from '../src/features/certificate/fonts/metrics'

const RAIZ = process.cwd()
const PASTA = path.join(RAIZ, 'public', 'fonts', 'cert')

/** `OFL-Poppins.txt`, `OFL-PlayfairDisplay.txt`: o aviso de copyright muda por família. */
function licencaDa(familia: string): string {
  return path.join(PASTA, 'LICENSES', `OFL-${familia.replaceAll(' ', '')}.txt`)
}

function main(): void {
  const problemas: string[] = []
  const avisos = readFileSync(path.join(RAIZ, 'THIRD_PARTY_NOTICES.md'), 'utf8')

  for (const arquivo of readdirSync(PASTA).filter((nome) => nome.endsWith('.ttf'))) {
    if (!CURATED_FONTS.some((fonte) => fonte.file === arquivo)) {
      problemas.push(`${arquivo}: está na pasta e fora do catálogo (fonts/catalog.ts).`)
    }
  }

  for (const fonte of CURATED_FONTS) {
    const caminho = path.join(PASTA, fonte.file)
    if (!existsSync(caminho)) {
      problemas.push(`${fonte.ref}: ${fonte.file} não existe em public/fonts/cert/.`)
      continue
    }
    const metricas = loadFont(new Uint8Array(readFileSync(caminho)))

    if (isVariableFont(metricas.font)) {
      problemas.push(
        `${fonte.file}: é variável (tabela fvar). Use o estático do peso ${fonte.weight}.`,
      )
    }
    // Arquivo trocado de peso sai no PDF com o peso errado, sem erro nenhum.
    const pesoDoArquivo = (
      metricas.font as unknown as { 'OS/2': { usWeightClass: number } }
    )['OS/2'].usWeightClass
    if (pesoDoArquivo !== fonte.weight) {
      problemas.push(
        `${fonte.file}: o catálogo diz peso ${fonte.weight}, e o arquivo, ${pesoDoArquivo}.`,
      )
    }
    const { missing } = checkCoverage(metricas)
    if (missing.length > 0) {
      problemas.push(`${fonte.file}: não tem ${missing.join(' ')}.`)
    }
    if (!avisos.includes(`\`${fonte.file}\``)) {
      problemas.push(`${fonte.file}: fora da tabela do THIRD_PARTY_NOTICES.md.`)
    }
  }

  for (const familia of new Set(CURATED_FONTS.map((fonte) => fonte.family))) {
    if (!existsSync(licencaDa(familia))) {
      problemas.push(
        `${familia}: sem licença em LICENSES/${path.basename(licencaDa(familia))}.`,
      )
    }
  }

  if (problemas.length > 0) {
    console.error('✖ Fontes curadas com problema\n')
    for (const problema of problemas) console.error(`  ${problema}`)
    process.exit(1)
  }

  console.log(
    `✔ ${CURATED_FONTS.length} fontes curadas: estáticas, com peso, cobertura e licença.`,
  )
}

main()
