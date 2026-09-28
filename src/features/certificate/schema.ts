import { z } from '@/lib/zod'

import { isReservedKey } from './reserved-keys'

/**
 * Formato do modelo, `schema_version: 1` (doc 05). Gravado em JSON no banco,
 * por isso os nomes em `snake_case`. O motor só lê o `published_snapshot`,
 * validado por `templateSnapshotSchema`.
 *
 * Coordenadas normalizadas de 0 a 1, origem no topo-esquerda. Aqui fica só a
 * forma de cada campo; a coerência do rascunho e as 7 regras de publicação
 * estão em `publish.ts`.
 */

export const MAX_DATA_FIELDS = 20
export const MAX_LAYOUT_FIELDS = 40

const COR = /^#[0-9A-Fa-f]{6}$/
const REFERENCIA_DE_FONTE = /^(curated:[a-z0-9]+(-[a-z0-9]+)*|custom:[0-9a-f-]{36})$/
const CHAVE = /^[a-z][a-z0-9_]{1,39}$/

const fracao = z.number().min(0).max(1)
const medida = z.number().gt(0).max(1)

export const boxSchema = z.object({ x: fracao, y: fracao, w: medida, h: medida })

const formatoSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), max_length: z.int().min(1).max(300).default(120) }),
  z.object({
    type: z.literal('number'),
    decimals: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  }),
  z.object({ type: z.literal('date'), style: z.enum(['short', 'long']) }),
  z.object({ type: z.literal('hours'), style: z.enum(['number', 'short', 'long']) }),
])

export const dataFieldSchema = z
  .object({
    key: z
      .string()
      .regex(
        CHAVE,
        'A chave usa minúsculas, números e _, começa por letra e tem de 2 a 40 caracteres.',
      ),
    label: z.string().trim().min(2).max(60),
    type: z.enum(['text', 'number', 'date', 'hours']),
    required: z.boolean(),
    default: z.string().nullable(),
    format: formatoSchema,
  })
  .superRefine((campo, ctx) => {
    if (campo.format.type !== campo.type) {
      ctx.addIssue({
        code: 'custom',
        path: ['format'],
        message: 'O formato precisa ser do mesmo tipo do campo.',
      })
    }
    // Guardrail do CPF, primeira barreira: identidade não é conteúdo.
    for (const campoDeTexto of ['key', 'label'] as const) {
      if (isReservedKey(campo[campoDeTexto])) {
        ctx.addIssue({
          code: 'custom',
          path: [campoDeTexto],
          message:
            'Nome, CPF, e-mail e data de nascimento são da identidade da pessoa, e não conteúdo do certificado.',
        })
      }
    }
  })

const pagina = z.union([z.literal(1), z.literal(2)])

export const textFieldSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('text'),
    page: pagina,
    box: boxSchema,
    content: z.string().max(1000),
    font: z.string().regex(REFERENCIA_DE_FONTE, 'Fonte desconhecida.'),
    size_pt: z.number().min(6).max(200),
    min_size_pt: z.number().min(6).max(200),
    // A única cor livre do sistema: pertence à arte, e não à interface.
    color: z.string().regex(COR, 'Use uma cor no formato #RRGGBB.'),
    h_align: z.enum(['left', 'center', 'right']),
    v_align: z.enum(['top', 'middle', 'bottom']),
    line_height: z.number().min(1).max(2).default(1.15),
    max_lines: z.int().min(1).max(8).default(2),
    fit: z.enum(['shrink_then_wrap', 'wrap_then_shrink']),
    transform: z.enum(['none', 'uppercase', 'title_pt_br']),
  })
  .superRefine((campo, ctx) => {
    if (campo.min_size_pt > campo.size_pt) {
      ctx.addIssue({
        code: 'custom',
        path: ['min_size_pt'],
        message: 'O tamanho mínimo não pode passar do tamanho do texto.',
      })
    }
  })

export const qrFieldSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.literal('qr'),
  page: pagina,
  // O QR ocupa o maior quadrado centrado na caixa.
  box: boxSchema,
  dark: z.string().regex(COR).default('#000000'),
  light: z.string().regex(COR).nullable().default('#FFFFFF'),
})

export const layoutFieldSchema = z.discriminatedUnion('kind', [
  textFieldSchema,
  qrFieldSchema,
])

export const pageSchema = z.object({
  width_pt: z.number().positive(),
  height_pt: z.number().positive(),
  preview_path: z.string().nullable(),
})

/**
 * Teto do `base.pdf` (doc 05), o mesmo do check no banco: a resposta de uma
 * Vercel Function vai até 4,5 MB, e o resto do PDF é fonte e texto.
 */
export const BASE_PDF_MAX_BYTES = 3 * 1024 * 1024

export const templateSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    version: z.int().min(1),
    base_pdf_path: z.string().min(1),
    base_pdf_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    base_pdf_size_bytes: z.int().min(1).max(BASE_PDF_MAX_BYTES),
    pages: z.array(pageSchema).min(1).max(2),
    data_fields: z.array(dataFieldSchema).max(MAX_DATA_FIELDS),
    layout_fields: z.array(layoutFieldSchema).max(MAX_LAYOUT_FIELDS),
  })
  .superRefine((modelo, ctx) => {
    const repetida = (valores: string[]) =>
      valores.find((v, i) => valores.indexOf(v) !== i)

    const chave = repetida(modelo.data_fields.map((campo) => campo.key))
    if (chave) {
      ctx.addIssue({
        code: 'custom',
        path: ['data_fields'],
        message: `Chave repetida: ${chave}.`,
      })
    }
    const id = repetida(modelo.layout_fields.map((campo) => campo.id))
    if (id) {
      ctx.addIssue({
        code: 'custom',
        path: ['layout_fields'],
        message: `Campo repetido: ${id}.`,
      })
    }
    for (const campo of modelo.layout_fields) {
      if (campo.page > modelo.pages.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['layout_fields'],
          message: `O campo ${campo.id} está na página ${campo.page}, que o modelo não tem.`,
        })
      }
    }
  })

export type Box = z.infer<typeof boxSchema>
export type DataField = z.infer<typeof dataFieldSchema>
export type TextField = z.infer<typeof textFieldSchema>
export type QrField = z.infer<typeof qrFieldSchema>
export type LayoutField = z.infer<typeof layoutFieldSchema>
export type TemplatePage = z.infer<typeof pageSchema>
export type TemplateSnapshot = z.infer<typeof templateSnapshotSchema>
