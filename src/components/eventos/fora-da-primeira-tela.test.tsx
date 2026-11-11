import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ForaDaPrimeiraTela } from './fora-da-primeira-tela'

let estado: DocumentReadyState = 'interactive'

function tela({ colunas, carregada }: { colunas: 1 | 2; carregada: boolean }) {
  estado = carregada ? 'complete' : 'interactive'
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (consulta: string) => ({
      matches: colunas === 2 && consulta === '(min-width: 640px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
  Object.defineProperty(document, 'readyState', { configurable: true, get: () => estado })
}

afterEach(() => {
  // Volta ao readyState do protótipo, o de verdade do jsdom.
  Reflect.deleteProperty(document, 'readyState')
})

function montarCapa() {
  render(
    <ForaDaPrimeiraTela>
      <p>capa</p>
    </ForaDaPrimeiraTela>,
  )
}
const capa = () => screen.queryByText('capa')

describe('ForaDaPrimeiraTela', () => {
  it('no celular, a capa espera o load da página', () => {
    tela({ colunas: 1, carregada: false })
    montarCapa()
    expect(capa()).toBeNull()

    // Como no navegador: quando o load dispara, o documento já está completo.
    act(() => {
      estado = 'complete'
      window.dispatchEvent(new Event('load'))
    })
    expect(capa()).toBeInTheDocument()
  })

  it('no celular, com a página já carregada, a capa monta de imediato', () => {
    tela({ colunas: 1, carregada: true })
    montarCapa()
    expect(capa()).toBeInTheDocument()
  })

  it('com duas colunas ou mais, a capa está na primeira linha e não espera', () => {
    tela({ colunas: 2, carregada: false })
    montarCapa()
    expect(capa()).toBeInTheDocument()
  })
})
