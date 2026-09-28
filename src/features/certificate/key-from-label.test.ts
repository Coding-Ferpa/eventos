import { describe, expect, it } from 'vitest'

import { keyFromLabel } from './key-from-label'

describe('keyFromLabel', () => {
  it.each([
    ['Título da palestra', 'titulo_palestra'],
    ['Carga horária do minicurso', 'carga_horaria_minicurso'],
    ['Turma', 'turma'],
    ['  Nota   final! ', 'nota_final'],
    ['1º lugar', 'campo_1_lugar'],
  ])('%s → %s', (rotulo, chave) => {
    expect(keyFromLabel(rotulo)).toBe(chave)
  })

  it('cabe nos 40 caracteres da chave do doc 05', () => {
    const chave = keyFromLabel(
      'Nome muito comprido de um campo de conteúdo qualquer do modelo',
    )
    expect(chave.length).toBeLessThanOrEqual(40)
    expect(chave).toMatch(/^[a-z][a-z0-9_]{1,39}$/)
  })
})
