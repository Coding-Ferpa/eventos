import { describe, expect, it } from 'vitest'

import { dataFieldSchema, layoutFieldSchema, templateSnapshotSchema } from './schema'

const DATA_FIELD = {
  key: 'titulo_palestra',
  label: 'Título da palestra',
  type: 'text',
  required: true,
  default: null,
  format: { type: 'text', max_length: 160 },
}

const NOME = {
  id: 'nome',
  kind: 'text',
  page: 1,
  box: { x: 0.1, y: 0.4, w: 0.8, h: 0.12 },
  content: '{{participant.full_name}}',
  font: 'curated:poppins-600',
  size_pt: 32,
  min_size_pt: 16,
  color: '#1E1E1E',
  h_align: 'center',
  v_align: 'middle',
  fit: 'shrink_then_wrap',
  transform: 'none',
}

const QR = { id: 'qr', kind: 'qr', page: 1, box: { x: 0.85, y: 0.8, w: 0.1, h: 0.15 } }

const SNAPSHOT = {
  schema_version: 1,
  version: 1,
  base_pdf_sha256: 'a'.repeat(64),
  pages: [{ width_pt: 841.89, height_pt: 595.28, preview_path: null }],
  data_fields: [DATA_FIELD],
  layout_fields: [NOME, QR],
}

describe('dataFieldSchema', () => {
  it('aceita o campo de conteúdo declarado pelo modelo', () => {
    expect(dataFieldSchema.safeParse(DATA_FIELD).success).toBe(true)
  })

  it('recusa chave de identidade, na chave e no rótulo (guardrail do CPF)', () => {
    expect(dataFieldSchema.safeParse({ ...DATA_FIELD, key: 'cpf_aluno' }).success).toBe(
      false,
    )
    expect(dataFieldSchema.safeParse({ ...DATA_FIELD, label: 'CPF' }).success).toBe(false)
    expect(dataFieldSchema.safeParse({ ...DATA_FIELD, key: 'nome' }).success).toBe(false)
  })

  it('recusa chave fora do formato', () => {
    for (const key of ['Titulo', '1titulo', 't', 'título', 'a'.repeat(41)]) {
      expect(dataFieldSchema.safeParse({ ...DATA_FIELD, key }).success, key).toBe(false)
    }
  })

  it('o formato tem de ser do mesmo tipo do campo', () => {
    expect(
      dataFieldSchema.safeParse({
        ...DATA_FIELD,
        type: 'hours',
        format: { type: 'text', max_length: 10 },
      }).success,
    ).toBe(false)
    expect(
      dataFieldSchema.safeParse({
        ...DATA_FIELD,
        type: 'hours',
        format: { type: 'hours', style: 'long' },
      }).success,
    ).toBe(true)
  })

  it('texto vai de 1 a 300 caracteres, 120 se não disser', () => {
    const campo = dataFieldSchema.parse({ ...DATA_FIELD, format: { type: 'text' } })
    expect(campo.format).toEqual({ type: 'text', max_length: 120 })
    expect(
      dataFieldSchema.safeParse({
        ...DATA_FIELD,
        format: { type: 'text', max_length: 301 },
      }).success,
    ).toBe(false)
  })
})

describe('layoutFieldSchema', () => {
  it('campo de texto ganha os padrões do doc 05', () => {
    const campo = layoutFieldSchema.parse(NOME)
    expect(campo).toMatchObject({ line_height: 1.15, max_lines: 2 })
  })

  it('QR ganha fundo branco e módulos pretos por padrão', () => {
    expect(layoutFieldSchema.parse(QR)).toMatchObject({
      dark: '#000000',
      light: '#FFFFFF',
    })
    expect(layoutFieldSchema.parse({ ...QR, light: null })).toMatchObject({ light: null })
  })

  it.each([
    ['tamanho mínimo acima do nominal', { min_size_pt: 40 }],
    ['fonte que não é referência', { font: 'Poppins' }],
    ['cor fora de #RRGGBB', { color: 'red' }],
    ['caixa fora de [0, 1]', { box: { x: -0.1, y: 0.4, w: 0.8, h: 0.1 } }],
    ['caixa sem largura', { box: { x: 0.1, y: 0.4, w: 0, h: 0.1 } }],
    ['tamanho acima de 200 pt', { size_pt: 201 }],
    ['nove linhas', { max_lines: 9 }],
  ])('recusa %s', (_caso, mudanca) => {
    expect(layoutFieldSchema.safeParse({ ...NOME, ...mudanca }).success).toBe(false)
  })

  it('aceita fonte enviada pelo admin', () => {
    expect(
      layoutFieldSchema.safeParse({
        ...NOME,
        font: 'custom:0b4ed4e6-2a4c-4f7e-9d71-1f5e2d3c4b5a',
      }).success,
    ).toBe(true)
  })
})

describe('templateSnapshotSchema', () => {
  it('aceita o snapshot de um modelo publicado', () => {
    expect(templateSnapshotSchema.safeParse(SNAPSHOT).success).toBe(true)
  })

  it('campo na página 2 exige modelo de duas páginas', () => {
    const naPagina2 = { ...SNAPSHOT, layout_fields: [NOME, { ...QR, page: 2 }] }
    expect(templateSnapshotSchema.safeParse(naPagina2).success).toBe(false)
    expect(
      templateSnapshotSchema.safeParse({
        ...naPagina2,
        pages: [
          ...SNAPSHOT.pages,
          { width_pt: 595.28, height_pt: 841.89, preview_path: null },
        ],
      }).success,
    ).toBe(true)
  })

  it('recusa chave repetida e id de campo repetido', () => {
    expect(
      templateSnapshotSchema.safeParse({
        ...SNAPSHOT,
        data_fields: [DATA_FIELD, DATA_FIELD],
      }).success,
    ).toBe(false)
    expect(
      templateSnapshotSchema.safeParse({ ...SNAPSHOT, layout_fields: [NOME, NOME] })
        .success,
    ).toBe(false)
  })

  it('no máximo 20 campos de conteúdo e 40 posicionados', () => {
    const vinteEUm = Array.from({ length: 21 }, (_, i) => ({
      ...DATA_FIELD,
      key: `campo_${i}`,
    }))
    expect(
      templateSnapshotSchema.safeParse({ ...SNAPSHOT, data_fields: vinteEUm }).success,
    ).toBe(false)
  })
})
