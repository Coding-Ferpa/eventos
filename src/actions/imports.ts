'use server'

import { createHash } from 'node:crypto'

import { and, asc, eq, gt, sql } from 'drizzle-orm'

import type { Transaction } from '@/db/client'
import {
  lastAppliedWithSameFile,
  loadImportContext,
  mappingContextFor,
  type ImportTypeContext,
} from '@/db/queries/imports'
import {
  certificateTemplates,
  certificates,
  events,
  importBatches,
  importRows,
  participants,
} from '@/db/schema'
import { mascararNaAmostra } from '@/features/import/cpf'
import { decodeCsv } from '@/features/import/decode'
import {
  cellsForRow,
  checkMapping,
  mappingTargets,
  normalizeHeader,
  presetFromMapping,
  suggestMapping,
  targetLabel,
  type Mapping,
  type MappingContext,
} from '@/features/import/mapping'
import { warnNamesBelowMin } from '@/features/import/name-fit-warnings'
import { parseCsv } from '@/features/import/parse'
import { validateRow, type StagedRow } from '@/features/import/validate-row'
import { serverEnv } from '@/lib/env'
import { hmacCpf } from '@/lib/hmac'
import { z } from '@/lib/zod'

import { defineAction, FalhaDaAction } from './define-action'

/**
 * Os quatro passos da importação (docs 06 e 07). O arquivo trafega duas vezes,
 * na inspeção e na prévia, e nunca é gravado (ADR-0011): o staging guarda as
 * linhas já validadas, com o CPF já em HMAC.
 */

const LIMITE_DO_ARQUIVO = 2 * 1024 * 1024
const LINHAS_POR_INSERT = 500

export type ImportSummary = {
  create: number
  update: number
  unchanged: number
  error: number
  needs_decision: number
  skipped: number
  new_people: number
  absent: number
  total: number
  warnings: Record<string, number>
}

// --- Entrada por FormData ---------------------------------------------------

const arquivo = z
  .instanceof(File, { message: 'Escolha um arquivo .csv ou .txt.' })
  .refine((f) => /\.(csv|txt)$/i.test(f.name), 'Envie um arquivo .csv ou .txt.')

const tipoOpcional = z.preprocess(
  (valor) => (valor === '' || valor === null || valor === undefined ? null : valor),
  z.uuid().nullable(),
)

const mapeamentoJson = z
  .string()
  .transform((texto, ctx) => {
    try {
      return JSON.parse(texto) as unknown
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Mapeamento inválido.' })
      return z.NEVER
    }
  })
  .pipe(z.record(z.string(), z.string()))

function doFormulario<T extends z.ZodRawShape>(forma: T) {
  return z.preprocess(
    (valor) =>
      valor instanceof FormData
        ? Object.fromEntries([...valor.keys()].map((chave) => [chave, valor.get(chave)]))
        : valor,
    z.object(forma),
  )
}

// --- O arquivo e o contexto -------------------------------------------------

const CODIGO_DO_PARSE = {
  SINGLE_COLUMN: 'single_column',
  EMPTY_FILE: 'empty_file',
  TOO_MANY_ROWS: 'too_many_rows',
} as const

async function lerPlanilha(planilha: File) {
  if (planilha.size > LIMITE_DO_ARQUIVO) {
    throw new FalhaDaAction('file_too_large', 'O arquivo pode ter até 2 MB.')
  }
  const bytes = new Uint8Array(await planilha.arrayBuffer())
  const decodificado = decodeCsv(bytes)
  const lido = parseCsv(decodificado.text)
  if (!lido.ok)
    throw new FalhaDaAction(CODIGO_DO_PARSE[lido.error.code], lido.error.message)
  return {
    decodificado,
    csv: lido.csv,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function contextoDoEvento(tx: Transaction, eventId: string, tipoId: string | null) {
  const contexto = await loadImportContext(tx, eventId)
  if (!contexto) throw new FalhaDaAction('not_found', 'Não encontramos esse evento.')
  if (tipoId !== null) {
    const tipo = contexto.types.find((candidato) => candidato.id === tipoId)
    if (!tipo)
      throw new FalhaDaAction(
        'not_found',
        'Esse tipo de participação não é deste evento.',
      )
    // Toda linha seria TYPE_WITHOUT_TEMPLATE: melhor dizer uma vez, antes.
    if (tipo.dataFields === null) {
      throw new FalhaDaAction(
        'validation_error',
        `O tipo ${tipo.label} ainda não tem modelo. Escolha um modelo para ele antes de importar.`,
      )
    }
  }
  return contexto
}

function alvosDaTela(ctx: MappingContext) {
  const obrigatorios = new Set<string>([
    'full_name',
    ...(ctx.multipleTypes ? ['participation_type'] : []),
  ])
  if (!ctx.multipleTypes) {
    for (const campo of ctx.dataFields) {
      if (campo.required && campo.default === null) obrigatorios.add(`data.${campo.key}`)
    }
  }
  return mappingTargets(ctx).map((alvo) => ({
    target: alvo,
    label: targetLabel(alvo, ctx),
    required: obrigatorios.has(alvo),
  }))
}

function paraStaging(batchId: string, linha: StagedRow) {
  return {
    batchId,
    rowNumber: linha.rowNumber,
    participationTypeId: linha.participationTypeId,
    fullName: linha.fullName,
    cpfHash: linha.cpfHash,
    cpfLast3: linha.cpfLast3,
    birthDate: linha.birthDate,
    email: linha.email,
    hours: linha.hours === null ? null : String(linha.hours),
    data: linha.data,
    dataDefaults: linha.dataDefaults,
    issues: linha.issues,
  }
}

async function calcularDiff(tx: Transaction, batchId: string) {
  const [linha] = await tx.execute<{ resumo: ImportSummary }>(
    sql`select public.compute_import_diff(${batchId}) as resumo`,
  )
  const [lote] = await tx
    .select({ previewDigest: importBatches.previewDigest })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
  return { summary: linha!.resumo, previewDigest: lote!.previewDigest! }
}

async function loteEmPrevia(tx: Transaction, batchId: string) {
  const [lote] = await tx
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .for('update')
  if (!lote) throw new FalhaDaAction('not_found', 'Não encontramos essa importação.')
  if (lote.status !== 'staged') {
    throw new FalhaDaAction(
      'batch_not_staged',
      'Esta importação já foi aplicada, descartada ou expirou.',
    )
  }
  return lote
}

/**
 * O mapeamento confirmado vira o preset de cada modelo envolvido (doc 06): no
 * próximo arquivo, a tela já abre preenchida. Cada modelo guarda só os alvos
 * que fazem sentido para ele.
 */
async function gravarPreset(
  tx: Transaction,
  tipos: ImportTypeContext[],
  tipoId: string | null,
  mapping: Mapping,
) {
  const envolvidos = tipoId === null ? tipos : tipos.filter((tipo) => tipo.id === tipoId)
  const porModelo = new Map<string, Set<string>>()
  for (const tipo of envolvidos) {
    if (tipo.templateId === null) continue
    const alvos = porModelo.get(tipo.templateId) ?? new Set(IDENTIDADE_E_SISTEMA)
    for (const campo of tipo.dataFields ?? []) alvos.add(`data.${campo.key}`)
    porModelo.set(tipo.templateId, alvos)
  }
  for (const [templateId, alvos] of porModelo) {
    const doModelo = Object.fromEntries(
      Object.entries(mapping).filter(([alvo]) => alvos.has(alvo)),
    )
    await tx
      .update(certificateTemplates)
      .set({ columnMapping: presetFromMapping(doModelo) })
      .where(eq(certificateTemplates.id, templateId))
  }
}

const IDENTIDADE_E_SISTEMA = [
  'full_name',
  'cpf',
  'birth_date',
  'email',
  'participation_type',
  'hours',
]

/** `***.***.**7-25`: só os três dígitos guardados (doc 08). */
function cpfMascarado(ultimos: string | null) {
  return ultimos === null ? null : `***.***.**${ultimos[0]}-${ultimos.slice(1)}`
}

// --- Passo 1: inspeção ------------------------------------------------------

export const inspectCsv = defineAction({
  nome: 'import.inspect',
  entidade: 'import_batches',
  papelMinimo: 'editor',
  // Exceção documentada no doc 07: só lê, e não grava nada.
  auditar: false,
  schema: doFormulario({
    file: arquivo,
    eventId: z.uuid(),
    participationTypeId: tipoOpcional,
  }),
  async executar({ entrada, tx }) {
    const contexto = await contextoDoEvento(
      tx,
      entrada.eventId,
      entrada.participationTypeId,
    )
    const { decodificado, csv, sha256 } = await lerPlanilha(entrada.file)
    const ctx = mappingContextFor(contexto, entrada.participationTypeId)
    const aplicadoEm = await lastAppliedWithSameFile(tx, entrada.eventId, sha256)
    const sugestao = suggestMapping(csv.headers, ctx)

    return {
      data: {
        fileName: entrada.file.name,
        encoding: decodificado.encoding,
        delimiter: csv.delimiter,
        headers: csv.headers,
        // Vai para o navegador: CPF em claro só existe dentro do validate-row.
        sampleRows: csv.rows
          .slice(0, 10)
          .map((linha) => linha.cells.map(mascararNaAmostra)),
        rowCount: csv.rows.length,
        fileSha256: sha256,
        suggestedMapping: sugestao,
        // O preset corre primeiro na sugestão e guarda o cabeçalho normalizado:
        // alvo sugerido com ele veio do modelo (doc 03, 6f).
        presetApplied: Object.entries(ctx.preset).some(([alvo, cabecalho]) => {
          const sugerido = sugestao[alvo as keyof typeof sugestao]
          return sugerido !== undefined && normalizeHeader(sugerido) === cabecalho
        }),
        targets: alvosDaTela(ctx),
        warnings: [
          ...decodificado.warnings.map((code) => ({ code, appliedAt: null })),
          ...(aplicadoEm
            ? [{ code: 'ALREADY_APPLIED' as const, appliedAt: aplicadoEm.toISOString() }]
            : []),
        ],
      },
    }
  },
})

// --- Passo 3: prévia --------------------------------------------------------

export const stageImport = defineAction({
  nome: 'import.stage',
  entidade: 'import_batches',
  papelMinimo: 'editor',
  schema: doFormulario({
    file: arquivo,
    eventId: z.uuid(),
    participationTypeId: tipoOpcional,
    mapping: mapeamentoJson,
  }),
  async executar({ entrada, usuario, tx }) {
    const contexto = await contextoDoEvento(
      tx,
      entrada.eventId,
      entrada.participationTypeId,
    )
    const { decodificado, csv, sha256 } = await lerPlanilha(entrada.file)
    const mapping = entrada.mapping as Mapping

    const { blocking } = checkMapping(
      mapping,
      csv.headers,
      mappingContextFor(contexto, entrada.participationTypeId),
    )
    if (blocking.length > 0) {
      throw new FalhaDaAction(
        'mapping_incomplete',
        blocking.map((problema) => problema.message).join(' '),
      )
    }

    // O CPF em claro existe daqui até o HMAC, dentro de validateRow, e não
    // sai de lá (doc 06).
    const pepper = serverEnv().CPF_PEPPER
    const ctxLinha = {
      types: contexto.types,
      fixedTypeId: entrada.participationTypeId,
      search: contexto.event.search,
      hashCpf: (cpf: string) => hmacCpf(pepper, contexto.event.cpfSalt, cpf),
      today: new Date(),
    }
    const linhas = csv.rows.map((linha) =>
      validateRow(
        linha.rowNumber,
        cellsForRow(csv.headers, linha.cells, mapping),
        ctxLinha,
      ),
    )
    await warnNamesBelowMin(tx, contexto, linhas)

    const [lote] = await tx
      .insert(importBatches)
      .values({
        eventId: entrada.eventId,
        participationTypeId: entrada.participationTypeId,
        fileName: entrada.file.name.slice(0, 255),
        fileSha256: sha256,
        encoding: decodificado.encoding,
        delimiter: csv.delimiter,
        rowCount: linhas.length,
        mapping: mapping as Record<string, string>,
        createdBy: usuario.id,
      })
      .returning({ id: importBatches.id })
    for (let i = 0; i < linhas.length; i += LINHAS_POR_INSERT) {
      await tx
        .insert(importRows)
        .values(
          linhas
            .slice(i, i + LINHAS_POR_INSERT)
            .map((linha) => paraStaging(lote!.id, linha)),
        )
    }

    await gravarPreset(tx, contexto.types, entrada.participationTypeId, mapping)

    const { summary, previewDigest } = await calcularDiff(tx, lote!.id)
    const { warnings: _, ...contadores } = summary
    return {
      data: { batchId: lote!.id, summary, previewDigest },
      entityId: lote!.id,
      diff: contadores,
    }
  },
})

const FILTROS = [
  'all',
  'create',
  'update',
  'unchanged',
  'error',
  'needs_decision',
  'skipped',
  'warning',
] as const

export const listImportRows = defineAction({
  nome: 'import.list_rows',
  entidade: 'import_batches',
  papelMinimo: 'editor',
  schema: z.object({
    batchId: z.uuid(),
    filter: z.enum(FILTROS).default('all'),
    cursor: z.int().min(0).default(0),
    limit: z.int().min(1).max(100).default(50),
  }),
  async executar({ entrada, tx }) {
    const filtro =
      entrada.filter === 'all'
        ? undefined
        : entrada.filter === 'warning'
          ? sql`jsonb_path_exists(${importRows.issues} || ${importRows.computedIssues}, '$[*] ? (@.severity == "warning")')`
          : eq(importRows.action, entrada.filter)

    const linhas = await tx
      .select({
        linha: importRows,
        participante: participants,
        certificado: certificates,
      })
      .from(importRows)
      .leftJoin(participants, eq(participants.id, importRows.matchedParticipantId))
      .leftJoin(certificates, eq(certificates.id, importRows.matchedCertificateId))
      .where(
        and(
          eq(importRows.batchId, entrada.batchId),
          gt(importRows.rowNumber, entrada.cursor),
          filtro,
        ),
      )
      .orderBy(asc(importRows.rowNumber))
      .limit(entrada.limit + 1)

    const pagina = linhas.slice(0, entrada.limit)
    return {
      data: {
        rows: pagina.map(({ linha, participante, certificado }) => ({
          rowNumber: linha.rowNumber,
          action: linha.action,
          personRow: linha.personRow,
          matchRule: linha.matchRule,
          resolution: linha.resolution,
          fullName: linha.fullName,
          email: linha.email,
          birthDate: linha.birthDate,
          cpf: cpfMascarado(linha.cpfLast3),
          hours: linha.hours === null ? null : Number(linha.hours),
          data: linha.data,
          issues: [...linha.issues, ...linha.computedIssues],
          // O antes, para a tela mostrar o antes e o depois por campo.
          before: participante
            ? {
                fullName: participante.fullName,
                email: participante.email,
                birthDate: participante.birthDate,
                cpf: cpfMascarado(participante.cpfLast3),
                hours: certificado ? Number(certificado.hours) : null,
                data: certificado?.data ?? null,
              }
            : null,
        })),
        nextCursor: linhas.length > entrada.limit ? pagina.at(-1)!.linha.rowNumber : null,
      },
      entityId: entrada.batchId,
    }
  },
})

export const resolveImportRow = defineAction({
  nome: 'import.resolve_row',
  entidade: 'import_batches',
  papelMinimo: 'editor',
  schema: z.object({
    batchId: z.uuid(),
    rowNumber: z.int().min(2),
    resolution: z.enum(['same_person', 'different_person', 'skip']),
  }),
  async executar({ entrada, tx }) {
    await loteEmPrevia(tx, entrada.batchId)
    const [linha] = await tx
      .select({ action: importRows.action, personRow: importRows.personRow })
      .from(importRows)
      .where(
        and(
          eq(importRows.batchId, entrada.batchId),
          eq(importRows.rowNumber, entrada.rowNumber),
        ),
      )
    if (!linha || linha.action !== 'needs_decision') {
      throw new FalhaDaAction('conflict', 'Esta linha não pede decisão.')
    }
    // A decisão é por pessoa: fica na primeira linha do grupo (doc 06).
    await tx
      .update(importRows)
      .set({ resolution: entrada.resolution })
      .where(
        and(
          eq(importRows.batchId, entrada.batchId),
          eq(importRows.rowNumber, linha.personRow ?? entrada.rowNumber),
        ),
      )
    const { summary, previewDigest } = await calcularDiff(tx, entrada.batchId)
    return {
      data: { summary, previewDigest },
      entityId: entrada.batchId,
      diff: { row: entrada.rowNumber, resolution: entrada.resolution },
    }
  },
})

// --- Passo 4: aplicação -----------------------------------------------------

type ResultadoDaAplicacao = {
  status: 'applied' | 'preview_stale' | 'decisions_pending' | 'failed' | 'not_staged'
  summary?: ImportSummary
  digest?: string
}

export const applyImport = defineAction({
  nome: 'import.apply',
  entidade: 'import_batches',
  papelMinimo: 'editor',
  // O apply_import se audita no banco, com o ator, na mesma transação.
  auditar: false,
  schema: z.object({
    batchId: z.uuid(),
    previewDigest: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  async executar({ entrada, usuario, tx }) {
    const [lote] = await tx
      .select({ slug: events.slug })
      .from(importBatches)
      .innerJoin(events, eq(events.id, importBatches.eventId))
      .where(eq(importBatches.id, entrada.batchId))
    if (!lote) throw new FalhaDaAction('not_found', 'Não encontramos essa importação.')

    const [linha] = await tx.execute<{ resultado: ResultadoDaAplicacao }>(
      sql`select public.apply_import(${entrada.batchId}, ${entrada.previewDigest}, ${usuario.id}) as resultado`,
    )
    const { status, summary, digest } = linha!.resultado
    if (status === 'not_staged') {
      throw new FalhaDaAction(
        'batch_not_staged',
        'Esta importação já foi aplicada, descartada ou expirou.',
      )
    }
    // Prévia velha, decisão pendente e falha não são erro da action: a
    // transação precisa terminar para a prévia nova (ou o lote failed) ficar.
    return {
      data: { status, summary: summary!, previewDigest: digest ?? null },
      entityId: entrada.batchId,
      tags: status === 'applied' ? [`event:${lote.slug}`] : [],
    }
  },
})

export const discardImport = defineAction({
  nome: 'import.discard',
  entidade: 'import_batches',
  papelMinimo: 'editor',
  schema: z.object({ batchId: z.uuid() }),
  async executar({ entrada, tx }) {
    const [lote] = await tx
      .select({ status: importBatches.status })
      .from(importBatches)
      .where(eq(importBatches.id, entrada.batchId))
      .for('update')
    if (!lote) throw new FalhaDaAction('not_found', 'Não encontramos essa importação.')
    if (lote.status !== 'staged' && lote.status !== 'failed') {
      throw new FalhaDaAction(
        'batch_not_staged',
        'Esta importação já foi aplicada, descartada ou expirou.',
      )
    }
    // O staging tem nome e e-mail: sai na hora (doc 08).
    await tx.delete(importRows).where(eq(importRows.batchId, entrada.batchId))
    await tx
      .update(importBatches)
      .set({ status: 'discarded' })
      .where(eq(importBatches.id, entrada.batchId))
    return {
      data: undefined,
      entityId: entrada.batchId,
      diff: { status: [lote.status, 'discarded'] },
    }
  },
})
