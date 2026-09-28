import { describe, expect, it } from 'vitest'

import {
  publicationProblems,
  templateDraftSchema,
  type PublicationInput,
  type TemplateDraft,
} from './publish'
import type { DataField, QrField, TextField } from './schema'

function texto(parcial: Partial<TextField> = {}): TextField {
  return {
    id: 'nome',
    kind: 'text',
    page: 1,
    box: { x: 0.1, y: 0.4, w: 0.8, h: 0.12 },
    content: '{{participant.full_name}}',
    font: 'curated:poppins-600',
    size_pt: 32,
    min_size_pt: 14,
    color: '#1E1E1E',
    h_align: 'center',
    v_align: 'middle',
    line_height: 1.15,
    max_lines: 2,
    fit: 'shrink_then_wrap',
    transform: 'none',
    ...parcial,
  }
}

const QR: QrField = {
  id: 'qr',
  kind: 'qr',
  page: 1,
  box: { x: 0.85, y: 0.75, w: 0.1, h: 0.15 },
  dark: '#000000',
  light: '#FFFFFF',
}

const TITULO: DataField = {
  key: 'titulo_palestra',
  label: 'Título da palestra',
  type: 'text',
  required: true,
  default: null,
  format: { type: 'text', max_length: 200 },
}

const COMPLETO: TemplateDraft = {
  data_fields: [TITULO],
  layout_fields: [
    texto(),
    texto({
      id: 'codigo',
      content: 'Código {{ certificate.code }}',
      size_pt: 10,
      min_size_pt: 8,
    }),
    texto({ id: 'palestra', content: 'com a palestra {{data.titulo_palestra}}' }),
    QR,
  ],
}

const PRONTO: PublicationInput = {
  draft: COMPLETO,
  hasBasePdf: true,
  pageCount: 1,
  unusableFonts: [],
  missingRequired: [],
}

function mensagensDoRascunho(rascunho: unknown) {
  const resultado = templateDraftSchema.safeParse(rascunho)
  return resultado.success ? [] : resultado.error.issues.map((issue) => issue.message)
}

describe('templateDraftSchema: o que o rascunho não salva', () => {
  it('aceita um rascunho coerente, mesmo incompleto para publicar', () => {
    expect(mensagensDoRascunho({ data_fields: [], layout_fields: [texto()] })).toEqual([])
    expect(mensagensDoRascunho(COMPLETO)).toEqual([])
  })

  it('placeholder desconhecido, ou de campo de conteúdo não declarado', () => {
    const erros = mensagensDoRascunho({
      data_fields: [],
      layout_fields: [
        texto({ content: '{{participant.cpf}} e {{data.titulo_palestra}}' }),
      ],
    })
    expect(erros).toEqual([
      'Placeholder desconhecido: {{participant.cpf}}, {{data.titulo_palestra}}.',
    ])
  })

  it('caixa que passa da borda da página', () => {
    const erros = mensagensDoRascunho({
      data_fields: [],
      layout_fields: [texto({ box: { x: 0.5, y: 0.9, w: 0.6, h: 0.2 } })],
    })
    expect(erros).toEqual(['A caixa de nome passa da borda da página.'])
  })

  it('a borda exata é dentro, e o erro de arredondamento do editor também', () => {
    expect(
      mensagensDoRascunho({
        data_fields: [],
        layout_fields: [texto({ box: { x: 0.7, y: 0.9, w: 0.3000000001, h: 0.1 } })],
      }),
    ).toEqual([])
  })

  it('chave de conteúdo e id de campo repetidos', () => {
    expect(
      mensagensDoRascunho({
        data_fields: [TITULO, TITULO],
        layout_fields: [texto(), texto()],
      }),
    ).toEqual(['Chave repetida: titulo_palestra.', 'Campo repetido: nome.'])
  })

  it('padrão que não serve ao tipo do campo', () => {
    const horas: DataField = {
      key: 'carga',
      label: 'Carga',
      type: 'hours',
      required: false,
      default: 'oito',
      format: { type: 'hours', style: 'long' },
    }
    expect(mensagensDoRascunho({ data_fields: [horas], layout_fields: [] })).toEqual([
      'O padrão de Carga não serve: Carga precisa ser uma carga horária, como 8 ou 1,5.',
    ])
  })
})

describe('publicationProblems: as 7 regras do doc 05', () => {
  const regras = (mudanca: Partial<PublicationInput>) =>
    publicationProblems({ ...PRONTO, ...mudanca }).map((problema) => problema.rule)

  it('o modelo completo publica', () => {
    expect(publicationProblems(PRONTO)).toEqual([])
  })

  it('1: sem base.pdf', () => {
    expect(regras({ hasBasePdf: false })).toEqual(['base_pdf'])
  })

  it('2: sem campo com o nome do participante', () => {
    const semNome = COMPLETO.layout_fields.filter((campo) => campo.id !== 'nome')
    expect(regras({ draft: { ...COMPLETO, layout_fields: semNome } })).toEqual([
      'name_field',
    ])
  })

  it('3: nenhum QR, ou dois', () => {
    const semQr = COMPLETO.layout_fields.filter((campo) => campo.kind !== 'qr')
    expect(regras({ draft: { ...COMPLETO, layout_fields: semQr } })).toEqual([
      'single_qr',
    ])
    const doisQr = [...COMPLETO.layout_fields, { ...QR, id: 'qr2' }]
    expect(regras({ draft: { ...COMPLETO, layout_fields: doisQr } })).toEqual([
      'single_qr',
    ])
  })

  it('4: sem o código em texto, para quem não tem câmera', () => {
    const semCodigo = COMPLETO.layout_fields.filter((campo) => campo.id !== 'codigo')
    expect(regras({ draft: { ...COMPLETO, layout_fields: semCodigo } })).toEqual([
      'code_field',
    ])
  })

  it('5: fonte que não existe ou não cobre o português', () => {
    const problemas = publicationProblems({
      ...PRONTO,
      unusableFonts: ['custom:0b4ed4e6-2a4c-4f7e-9d71-1f5e2d3c4b5a'],
    })
    expect(problemas).toEqual([
      {
        rule: 'fonts',
        message: expect.stringContaining('custom:0b4ed4e6-2a4c-4f7e-9d71-1f5e2d3c4b5a'),
      },
    ])
  })

  it('6: caixa fora da página, ou campo numa página que a arte não tem', () => {
    const fora = [
      ...COMPLETO.layout_fields,
      texto({ id: 'x', box: { x: 0.9, y: 0.1, w: 0.2, h: 0.1 } }),
    ]
    expect(regras({ draft: { ...COMPLETO, layout_fields: fora } })).toEqual([
      'boxes_inside',
    ])
    const noVerso = [...COMPLETO.layout_fields, texto({ id: 'verso', page: 2 })]
    expect(regras({ draft: { ...COMPLETO, layout_fields: noVerso } })).toEqual([
      'boxes_inside',
    ])
    expect(
      regras({ draft: { ...COMPLETO, layout_fields: noVerso }, pageCount: 2 }),
    ).toEqual([])
  })

  it('7: certificados sem um campo obrigatório, com a contagem e a chave', () => {
    const problemas = publicationProblems({
      ...PRONTO,
      missingRequired: [{ key: 'titulo_palestra', count: 37 }],
    })
    expect(problemas).toEqual([
      { rule: 'required_data', message: '37 certificados não têm titulo_palestra.' },
    ])
  })

  it('lista todas as regras violadas de uma vez, na ordem do doc', () => {
    expect(
      regras({
        hasBasePdf: false,
        draft: { data_fields: [], layout_fields: [] },
        missingRequired: [{ key: 'turma', count: 1 }],
      }),
    ).toEqual(['base_pdf', 'name_field', 'single_qr', 'code_field', 'required_data'])
  })
})
