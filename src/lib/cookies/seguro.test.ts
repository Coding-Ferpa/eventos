import { describe, expect, it } from 'vitest'

import { cookieSeguro } from './seguro'

describe('cookieSeguro', () => {
  it.each([
    'https://eventos.codingferpa.org/eventos/x',
    'https://cf-eventos-git-main.vercel.app/api/certificados/buscar',
    'https://localhost:3000/',
    // Produção mal configurada servindo http continua pedindo Secure.
    'http://eventos.codingferpa.org/',
    'http://localhost.example.com/',
    'http://192.168.0.10:3000/',
  ])('%s leva Secure', (url) => {
    expect(cookieSeguro(url)).toBe(true)
  })

  it.each([
    'http://localhost:3000/eventos/x',
    'http://127.0.0.1:3000/',
    'http://[::1]:3000/',
  ])('%s, http local, vai sem Secure', (url) => {
    expect(cookieSeguro(url)).toBe(false)
  })
})
