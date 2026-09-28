import 'server-only'

import { createHash } from 'node:crypto'

import { PDFDocument } from '@cantoo/pdf-lib'

import {
  checkCoverage,
  isVariableFont,
  REQUIRED_CHARACTERS,
} from '@/features/certificate/fonts/coverage'
import {
  cachedFontkit,
  FONT_FEATURES,
  loadFont,
} from '@/features/certificate/fonts/metrics'

/**
 * Os testes da fonte que o admin sobe (doc 05): o formato pelos bytes, fonte
 * variável recusada (o pdf-lib embute sem instanciar o eixo de peso, e o 700
 * sairia 400 sem erro), cobertura do português, e a ida e volta do subset.
 *
 * A ida e volta existe porque o subset do pdf-lib tem histórico de corromper
 * algumas fontes, sobretudo OTF com contornos CFF: gera um PDF com os
 * caracteres exigidos, extrai o texto com o pdf.js e compara. Fonte que falha
 * entra com `subset_ok = false` e é embutida inteira.
 */

export type FonteAvaliada =
  | { ok: true; family: string; weight: number; sha256: string; subsetOk: boolean }
  | {
      ok: false
      code: 'validation_error' | 'font_variable' | 'font_missing_glyphs'
      message: string
    }

const ASSINATURAS = [
  [0x00, 0x01, 0x00, 0x00], // TrueType
  [0x74, 0x72, 0x75, 0x65], // 'true', TrueType da Apple
  [0x4f, 0x54, 0x54, 0x4f], // 'OTTO', OpenType com CFF
]

function formatoAceito(bytes: Uint8Array) {
  return ASSINATURAS.some((assinatura) =>
    assinatura.every((byte, i) => bytes[i] === byte),
  )
}

async function textoDoPdf(pdf: Uint8Array): Promise<string> {
  // Só quando alguém sobe fonte: o pdf.js não pesa nas outras rotas.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const tarefa = getDocument({ data: pdf, useSystemFonts: false })
  try {
    const pagina = await (await tarefa.promise).getPage(1)
    const { items } = await pagina.getTextContent()
    return items.map((item) => ('str' in item ? item.str : '')).join('')
  } finally {
    await tarefa.destroy()
  }
}

async function subsetVoltaIntegro(bytes: Uint8Array): Promise<boolean> {
  try {
    const documento = await PDFDocument.create()
    documento.registerFontkit(cachedFontkit)
    const fonte = await documento.embedFont(bytes, {
      subset: true,
      features: FONT_FEATURES,
    })
    documento
      .addPage([2000, 100])
      .drawText(REQUIRED_CHARACTERS, { x: 10, y: 40, size: 10, font: fonte })
    return (await textoDoPdf(await documento.save())) === REQUIRED_CHARACTERS
  } catch {
    return false
  }
}

export async function avaliarFonteEnviada(bytes: Uint8Array): Promise<FonteAvaliada> {
  if (!formatoAceito(bytes)) {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Envie a fonte em TTF ou OTF, um arquivo por peso.',
    }
  }

  let metricas
  try {
    metricas = loadFont(bytes)
  } catch {
    return {
      ok: false,
      code: 'validation_error',
      message: 'Não conseguimos ler essa fonte. Confira o arquivo e envie de novo.',
    }
  }

  if (isVariableFont(metricas.font)) {
    return {
      ok: false,
      code: 'font_variable',
      message:
        'Essa é uma fonte variável. Envie o arquivo estático de cada peso (Regular, Bold...).',
    }
  }

  const { missing } = checkCoverage(metricas)
  if (missing.length > 0) {
    // Os acentos primeiro: é o que o admin reconhece como problema.
    const acentuados = missing.filter((c) => /[À-ÿªº°]/.test(c))
    const lista = [...acentuados, ...missing.filter((c) => !acentuados.includes(c))]
    const resto = lista.length > 20 ? ` e mais ${lista.length - 20}` : ''
    return {
      ok: false,
      code: 'font_missing_glyphs',
      message: `A fonte não tem ${lista.slice(0, 20).join(' ')}${resto}: nomes com esses caracteres sairiam quebrados.`,
    }
  }

  const peso = (metricas.font as unknown as { 'OS/2'?: { usWeightClass?: number } })[
    'OS/2'
  ]?.usWeightClass
  return {
    ok: true,
    // A família tipográfica (name ID 16), e não a legada, que no SemiBold é
    // "Poppins SemiBold".
    family:
      metricas.font.getName('preferredFamily') ?? metricas.font.familyName ?? 'Sem nome',
    // O banco guarda centenas: 350 vira 400.
    weight: Math.min(900, Math.max(100, Math.round((peso ?? 400) / 100) * 100)),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    subsetOk: await subsetVoltaIntegro(bytes),
  }
}
