import { describe, expect, it } from 'vitest'

import { cn } from './cn'

describe('cn', () => {
  it('junta classes e ignora o que é falso', () => {
    const ativo = false
    expect(cn('a', ativo && 'b', undefined, null, 'c')).toBe('a c')
  })

  it('resolve conflito do Tailwind pela última classe', () => {
    // É o motivo de existir: sem isso, a classe passada por prop não
    // sobrescreveria a do componente.
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    expect(cn('rounded-md', 'rounded-full')).toBe('rounded-full')
  })
})
