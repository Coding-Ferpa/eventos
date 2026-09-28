import { describe, expect, it } from 'vitest'

import { isReservedKey, looksLikeCpf, normalizeKey } from './reserved-keys'

// PDF-20 do doc 05: CPF nunca é conteúdo. Duas barreiras, porque uma só falha.
describe('normalizeKey', () => {
  it('tira acento, caixa, sublinhado, hífen e espaço', () => {
    expect(normalizeKey(' Data_de-Nascimento ')).toBe('datadenascimento')
    expect(normalizeKey('E-mail')).toBe('email')
  })
})

describe('isReservedKey (barreira da chave e do rótulo)', () => {
  it.each([
    'cpf',
    'CPF do aluno',
    'numero_cpf',
    'nome',
    'Nome completo',
    'name',
    'full_name',
    'e-mail',
    'Email',
    'nascimento',
    'Data de nascimento',
    'birth_date',
    'rg',
    'Documento',
  ])('%j é reservada', (chave) => {
    expect(isReservedKey(chave)).toBe(true)
  })

  it.each([
    'titulo_palestra',
    'Título da palestra',
    'turma',
    'orientador',
    'registro',
    'carga',
  ])('%j é conteúdo', (chave) => {
    expect(isReservedKey(chave)).toBe(false)
  })
})

describe('looksLikeCpf (barreira do valor)', () => {
  it('pega CPF válido, com ou sem pontuação', () => {
    expect(looksLikeCpf('529.982.247-25')).toBe(true)
    expect(looksLikeCpf('52998224725')).toBe(true)
    expect(looksLikeCpf('123.456.789-09')).toBe(true)
  })

  it('não confunde com número qualquer de 11 dígitos', () => {
    // Dígitos verificadores errados: é só um número.
    expect(looksLikeCpf('529.982.247-26')).toBe(false)
    expect(looksLikeCpf('12345678900')).toBe(false)
  })

  it('dígitos repetidos não contam como CPF', () => {
    expect(looksLikeCpf('111.111.111-11')).toBe(false)
  })

  it('texto comum passa', () => {
    expect(looksLikeCpf('Introdução ao Git')).toBe(false)
    expect(looksLikeCpf('Turma 2026/1')).toBe(false)
    expect(looksLikeCpf('')).toBe(false)
  })
})
