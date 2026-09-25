import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EventMarkdown } from './event-markdown'

describe('EventMarkdown', () => {
  it('renderiza o Markdown comum da descrição', () => {
    render(<EventMarkdown conteudo={'## Programação\n\n- Abertura\n- **Oficinas**'} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Programação' })).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('não executa nem mostra HTML cru, nem script', () => {
    const { container } = render(
      <EventMarkdown
        conteudo={'Antes <script>alert(1)</script> <img src=x onerror="alert(1)"> depois'}
      />,
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toContain('onerror')
  })

  it('link com javascript: perde o destino', () => {
    render(<EventMarkdown conteudo={'[clique](javascript:alert(1))'} />)

    const link = screen.getByText('clique').closest('a')
    expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript/i)
  })

  it('link de verdade abre em outra aba, sem acesso à janela de origem', () => {
    render(<EventMarkdown conteudo={'[site](https://codingferpa.org/)'} />)

    const link = screen.getByRole('link', { name: 'site' })
    expect(link).toHaveAttribute('href', 'https://codingferpa.org/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener')
  })

  it('um "#" na descrição não cria um segundo título principal', () => {
    render(<EventMarkdown conteudo={'# Outro título'} />)

    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByText('Outro título')).toBeVisible()
  })
})
