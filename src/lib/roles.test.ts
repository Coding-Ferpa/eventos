import { describe, expect, it } from 'vitest'

import {
  hasRole,
  isUserRole,
  MIN_ADMIN_ROLE,
  parseUserRole,
  USER_ROLES,
} from '@/lib/roles'

describe('hasRole', () => {
  it('respeita a hierarquia admin > editor > reader', () => {
    expect(hasRole('admin', 'editor')).toBe(true)
    expect(hasRole('editor', 'reader')).toBe(true)
    expect(hasRole('admin', 'reader')).toBe(true)
  })

  it('nega papel abaixo do mínimo exigido', () => {
    expect(hasRole('reader', 'editor')).toBe(false)
    expect(hasRole('editor', 'admin')).toBe(false)
  })

  it('aceita o próprio papel como suficiente', () => {
    for (const role of USER_ROLES) {
      expect(hasRole(role, role)).toBe(true)
    }
  })
})

describe('parseUserRole', () => {
  it('reconhece os papéis do enum do banco', () => {
    for (const role of USER_ROLES) {
      expect(parseUserRole(role)).toBe(role)
    }
  })

  it('cai para reader diante de valor inesperado', () => {
    // Um claim ausente ou adulterado não pode virar privilégio.
    expect(parseUserRole(undefined)).toBe('reader')
    expect(parseUserRole(null)).toBe('reader')
    expect(parseUserRole('superadmin')).toBe('reader')
    expect(parseUserRole('moderator')).toBe('reader')
    expect(parseUserRole(42)).toBe('reader')
    expect(parseUserRole({ role: 'admin' })).toBe('reader')
  })
})

describe('MIN_ADMIN_ROLE', () => {
  it('é editor: reader existe só porque o cadastro é aberto, e não entra no admin', () => {
    expect(MIN_ADMIN_ROLE).toBe('editor')
  })
})

describe('isUserRole', () => {
  it('separa papel válido de qualquer outra coisa', () => {
    expect(isUserRole('admin')).toBe(true)
    expect(isUserRole('constructor')).toBe(false)
    expect(isUserRole('')).toBe(false)
  })
})
