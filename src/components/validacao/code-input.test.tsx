import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CodeInput } from './code-input'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

beforeEach(() => {
  push.mockReset()
})

function campo() {
  return screen.getByLabelText('Código de validação')
}

describe('CodeInput', () => {
  it('põe maiúsculas e hífens enquanto a pessoa digita', async () => {
    render(<CodeInput />)

    await userEvent.type(campo(), '7k2m9qf4tx')

    expect(campo()).toHaveValue('7K2M-9QF-4TX')
  })

  it('troca as letras parecidas pelo algarismo, como a normalização', async () => {
    render(<CodeInput />)

    await userEvent.type(campo(), 'demo')

    expect(campo()).toHaveValue('DEM0')
  })

  it('código completo navega para a página do código, sem hífens', async () => {
    render(<CodeInput />)

    await userEvent.type(campo(), 'dem0-cf2-026')
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }))

    expect(push).toHaveBeenCalledWith('/validar/DEM0CF2026')
  })

  it('diz quanto falta, e não navega', async () => {
    render(<CodeInput />)

    await userEvent.type(campo(), '7K2M9QF')
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O código tem 10 caracteres. Faltam 3.',
    )
    expect(campo()).toHaveAttribute('aria-invalid', 'true')
    expect(push).not.toHaveBeenCalled()
  })

  it('aponta a letra que não existe', async () => {
    render(<CodeInput />)

    await userEvent.type(campo(), '7K2U9QF4TX')
    await userEvent.click(screen.getByRole('button', { name: 'Validar' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A letra U não existe nos nossos códigos. Confira a digitação.',
    )
  })

  it('o erro some quando a pessoa volta a digitar', async () => {
    render(<CodeInput />)

    await userEvent.click(screen.getByRole('button', { name: 'Validar' }))
    expect(screen.getByRole('alert')).toBeVisible()

    await userEvent.type(campo(), '7')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
