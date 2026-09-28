import { z } from '@/lib/zod'

import { buildDataSchema } from './data-schema'
import {
  dataFieldSchema,
  layoutFieldSchema,
  MAX_DATA_FIELDS,
  MAX_LAYOUT_FIELDS,
  type Box,
  type DataField,
  type LayoutField,
} from './schema'
import { findUnknownTokens, usedTokens } from './tokens'

/**
 * O que separa um rascunho de um modelo publicável (doc 05).
 *
 * `templateDraftSchema` é o que o `saveTemplateDraft` exige: um rascunho pode
 * estar incompleto (sem QR, sem arte), mas nunca incoerente (placeholder que
 * não existe, caixa fora da página, chave repetida). `publicationProblems` são
 * as 7 regras do `publishTemplate`, todas avaliadas de uma vez, para o admin
 * ver a lista inteira e não descobrir uma por tentativa.
 */

/** Folga para o arredondamento do editor: 0,3 + 0,7 em ponto flutuante. */
const FOLGA = 1e-6

function passaDaBorda(caixa: Box) {
  return caixa.x + caixa.w > 1 + FOLGA || caixa.y + caixa.h > 1 + FOLGA
}

function nomeDoCampo(campo: LayoutField) {
  return campo.kind === 'qr' ? 'QR' : campo.id
}

export const templateDraftSchema = z
  .object({
    data_fields: z.array(dataFieldSchema).max(MAX_DATA_FIELDS),
    layout_fields: z.array(layoutFieldSchema).max(MAX_LAYOUT_FIELDS),
  })
  .superRefine((rascunho, ctx) => {
    const repetido = (valores: string[]) =>
      valores.find((v, i) => valores.indexOf(v) !== i)

    const chave = repetido(rascunho.data_fields.map((campo) => campo.key))
    if (chave) {
      ctx.addIssue({
        code: 'custom',
        path: ['data_fields'],
        message: `Chave repetida: ${chave}.`,
      })
    }
    const id = repetido(rascunho.layout_fields.map((campo) => campo.id))
    if (id) {
      ctx.addIssue({
        code: 'custom',
        path: ['layout_fields'],
        message: `Campo repetido: ${id}.`,
      })
    }

    for (const [i, campo] of rascunho.data_fields.entries()) {
      if (campo.default === null || campo.default.trim() === '') continue
      const resultado = buildDataSchema([campo]).safeParse({ [campo.key]: campo.default })
      if (!resultado.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['data_fields', i, 'default'],
          message: `O padrão de ${campo.label} não serve: ${resultado.error.issues[0]?.message}`,
        })
      }
    }

    for (const [i, campo] of rascunho.layout_fields.entries()) {
      if (campo.kind === 'text') {
        const desconhecidos = findUnknownTokens(campo.content, rascunho.data_fields)
        if (desconhecidos.length > 0) {
          ctx.addIssue({
            code: 'custom',
            path: ['layout_fields', i, 'content'],
            message: `Placeholder desconhecido: ${desconhecidos.map((t) => `{{${t}}}`).join(', ')}.`,
          })
        }
      }
      if (passaDaBorda(campo.box)) {
        ctx.addIssue({
          code: 'custom',
          path: ['layout_fields', i, 'box'],
          message: `A caixa de ${nomeDoCampo(campo)} passa da borda da página.`,
        })
      }
    }
  })

export type TemplateDraft = { data_fields: DataField[]; layout_fields: LayoutField[] }

export type PublicationRule =
  | 'base_pdf'
  | 'name_field'
  | 'single_qr'
  | 'code_field'
  | 'fonts'
  | 'boxes_inside'
  | 'required_data'

export type PublicationProblem = { rule: PublicationRule; message: string }

export type PublicationInput = {
  draft: TemplateDraft
  hasBasePdf: boolean
  /** Páginas do `base.pdf`; 0 quando ainda não há arte. */
  pageCount: number
  /** Fontes referenciadas que não existem ou não cobrem o português (regra 5). */
  unusableFonts: string[]
  /**
   * Chaves obrigatórias sem padrão que faltam em certificados já existentes dos
   * tipos que usam o modelo (regra 7). Só o banco sabe contar.
   */
  missingRequired: { key: string; count: number }[]
}

function algumTextoCom(campos: LayoutField[], token: string) {
  return campos.some(
    (campo) => campo.kind === 'text' && usedTokens(campo.content).includes(token),
  )
}

export function publicationProblems(entrada: PublicationInput): PublicationProblem[] {
  const campos = entrada.draft.layout_fields
  const problemas: PublicationProblem[] = []
  const falha = (rule: PublicationRule, message: string) =>
    problemas.push({ rule, message })

  if (!entrada.hasBasePdf) {
    falha('base_pdf', 'Suba a arte do certificado.')
  }
  if (!algumTextoCom(campos, 'participant.full_name')) {
    falha('name_field', 'Falta um campo de texto com {{participant.full_name}}.')
  }
  const qrs = campos.filter((campo) => campo.kind === 'qr').length
  if (qrs !== 1) {
    falha(
      'single_qr',
      qrs === 0 ? 'Falta o QR de validação.' : `O modelo tem ${qrs} QRs; deve ter um.`,
    )
  }
  // Quem valida sem câmera digita o código: ele vai também em texto.
  if (!algumTextoCom(campos, 'certificate.code')) {
    falha('code_field', 'Falta um campo de texto com {{certificate.code}}.')
  }
  if (entrada.unusableFonts.length > 0) {
    falha(
      'fonts',
      `Fonte que não existe ou não cobre o português: ${entrada.unusableFonts.join(', ')}.`,
    )
  }
  const fora = campos.filter(
    (campo) => passaDaBorda(campo.box) || campo.page > entrada.pageCount,
  )
  if (entrada.hasBasePdf && fora.length > 0) {
    falha('boxes_inside', `Fora da página: ${fora.map(nomeDoCampo).join(', ')}.`)
  }
  for (const { key, count } of entrada.missingRequired) {
    falha(
      'required_data',
      count === 1
        ? `1 certificado não tem ${key}.`
        : `${count} certificados não têm ${key}.`,
    )
  }
  return problemas
}
