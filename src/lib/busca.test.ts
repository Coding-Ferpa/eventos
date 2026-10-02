import { describe, expect, it } from 'vitest'

import {
  camposDoMetodo,
  conferirCampo,
  corpoDaBusca,
  metodosDisponiveis,
  type ConfiguracaoDaBusca,
} from './busca'

const SO_CPF: ConfiguracaoDaBusca = {
  mode: 'any',
  byCpf: true,
  byEmail: false,
  byName: false,
  birthDateRequired: false,
}
const QUALQUER: ConfiguracaoDaBusca = {
  mode: 'any',
  byCpf: true,
  byEmail: true,
  byName: true,
  birthDateRequired: true,
}
const TODOS: ConfiguracaoDaBusca = { ...QUALQUER, mode: 'all', byEmail: false }

describe('metodosDisponiveis (doc 03, 6b: CPF, depois e-mail, depois nome)', () => {
  it('lista os métodos ligados, na ordem do doc', () => {
    expect(metodosDisponiveis(QUALQUER)).toEqual(['cpf', 'email', 'name'])
    expect(metodosDisponiveis({ ...QUALQUER, byCpf: false })).toEqual(['email', 'name'])
    expect(metodosDisponiveis(SO_CPF)).toEqual(['cpf'])
  })

  it('no modo "todos" não há o que escolher', () => {
    expect(metodosDisponiveis(TODOS)).toEqual([])
  })
})

describe('camposDoMetodo', () => {
  it('a data de nascimento só vem junto do nome, nunca sozinha', () => {
    expect(camposDoMetodo(QUALQUER, 'name')).toEqual(['full_name', 'birth_date'])
    expect(camposDoMetodo({ ...QUALQUER, birthDateRequired: false }, 'name')).toEqual([
      'full_name',
    ])
    expect(camposDoMetodo(QUALQUER, 'cpf')).toEqual(['cpf'])
    expect(camposDoMetodo(QUALQUER, 'email')).toEqual(['email'])
  })

  it('no modo "todos", todos os ligados', () => {
    expect(camposDoMetodo(TODOS, 'all')).toEqual(['cpf', 'full_name', 'birth_date'])
    expect(camposDoMetodo({ ...TODOS, byName: false, byEmail: true }, 'all')).toEqual([
      'cpf',
      'email',
    ])
  })
})

describe('conferirCampo', () => {
  const hoje = new Date('2026-10-02T12:00:00Z')

  it('CPF: vazio, incompleto, verificador errado e válido com ou sem máscara', () => {
    expect(conferirCampo('cpf', '', hoje)).toBe('Digite o CPF.')
    expect(conferirCampo('cpf', '529.982', hoje)).toBe(
      'Esse CPF não parece válido. Confira os números.',
    )
    expect(conferirCampo('cpf', '529.982.247-24', hoje)).toBe(
      'Esse CPF não parece válido. Confira os números.',
    )
    expect(conferirCampo('cpf', '111.111.111-11', hoje)).toBe(
      'Esse CPF não parece válido. Confira os números.',
    )
    expect(conferirCampo('cpf', '529.982.247-25', hoje)).toBeNull()
    expect(conferirCampo('cpf', '52998224725', hoje)).toBeNull()
  })

  it('e-mail', () => {
    expect(conferirCampo('email', '  ', hoje)).toBe('Digite o e-mail.')
    expect(conferirCampo('email', 'maria@', hoje)).toBe(
      'Esse e-mail parece incompleto. Confira.',
    )
    expect(conferirCampo('email', 'maria@exemplo', hoje)).toBe(
      'Esse e-mail parece incompleto. Confira.',
    )
    expect(conferirCampo('email', ' maria@exemplo.com.br ', hoje)).toBeNull()
  })

  it('nome', () => {
    expect(conferirCampo('full_name', ' Jo ', hoje)).toBe('Digite o nome completo.')
    expect(conferirCampo('full_name', 'Ana', hoje)).toBeNull()
  })

  it('data de nascimento', () => {
    expect(conferirCampo('birth_date', '', hoje)).toBe('Digite a data de nascimento.')
    expect(conferirCampo('birth_date', '31/02/2004', hoje)).toBe(
      'Essa data não existe. Use dia, mês e ano, como 15/03/2004.',
    )
    expect(conferirCampo('birth_date', '15/03/2004', hoje)).toBeNull()
  })
})

describe('corpoDaBusca (o contrato do doc 07)', () => {
  it('leva só os campos do método, com a data em aaaa-mm-dd e o e-mail aparado', () => {
    const valores = {
      cpf: '529.982.247-25',
      email: ' maria@exemplo.com.br ',
      full_name: ' Maria da Silva ',
      birth_date: '15/03/2004',
    }
    expect(
      corpoDaBusca('ferpa-tech-day', 'name', ['full_name', 'birth_date'], valores),
    ).toEqual({
      event_slug: 'ferpa-tech-day',
      method: 'name',
      full_name: 'Maria da Silva',
      birth_date: '2004-03-15',
    })
    expect(corpoDaBusca('ferpa-tech-day', 'all', ['cpf', 'email'], valores)).toEqual({
      event_slug: 'ferpa-tech-day',
      method: 'all',
      cpf: '529.982.247-25',
      email: 'maria@exemplo.com.br',
    })
  })
})
