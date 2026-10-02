import { expect, test } from '@playwright/test'

import { esperarSemViolacoesGraves } from '../support/axe'

/**
 * E01 do doc 11: o catálogo lista os eventos publicados, rascunho e arquivado
 * ficam de fora, e o card leva à página do evento. Depende do seed de
 * desenvolvimento (`pnpm db:reset`).
 */

test.describe('catálogo (E01)', () => {
  test('lista os eventos publicados, sem rascunho e sem arquivado', async ({ page }) => {
    await page.goto('/')

    const catalogo = page.getByRole('region', { name: 'Eventos' })
    for (const titulo of [
      'Ferpa Tech Day 2026',
      'Semana Acadêmica de TI 2026',
      'Oficina de Git para iniciantes',
      'Meetup de Dados',
      'Workshop de Acessibilidade na Web',
    ]) {
      await expect(catalogo.getByRole('heading', { name: titulo })).toBeVisible()
    }

    await expect(page.getByText('Hackathon Ferpa 2026')).toHaveCount(0)
    await expect(page.getByText('Evento de demonstração')).toHaveCount(0)
  })

  test('o card leva à página do evento', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: /Ferpa Tech Day 2026/ }).click()

    await expect(page).toHaveURL('/eventos/ferpa-tech-day-2026')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ferpa Tech Day 2026' }),
    ).toBeVisible()
  })

  test('o card mostra o período no fuso de São Paulo e o selo do status', async ({
    page,
  }) => {
    await page.goto('/')

    const card = page.getByRole('link', { name: /Semana Acadêmica de TI 2026/ })
    await expect(card.getByText('19 a 23 de outubro de 2026')).toBeVisible()
    await expect(card.getByText('Inscrições abertas')).toBeVisible()
  })

  test('a primeira visita recebe o cookie de dispositivo (doc 08)', async ({
    page,
    context,
  }) => {
    const resposta = await page.goto('/')

    const cookie = (await context.cookies()).find(({ name }) => name === 'cf-dispositivo')
    expect(cookie?.value).toMatch(/^v1\.[A-Za-z0-9_-]{22}\.\d+\.[A-Za-z0-9_-]{43}$/)

    // Os atributos são conferidos no cabeçalho que o servidor enviou, e não no
    // pote de cookies do navegador: o WebKit do Playwright fora do macOS
    // reporta todo cookie como `SameSite=None`.
    const setCookie = (await resposta?.allHeaders())?.['set-cookie'] ?? ''
    expect(setCookie).toMatch(/cf-dispositivo=v1\./)
    for (const atributo of [/HttpOnly/i, /SameSite=lax/i, /Max-Age=2592000/]) {
      expect(setCookie).toMatch(atributo)
    }
    // Em http://localhost vai sem Secure, que o WebKit não devolveria (doc 08);
    // em qualquer outro host vai com ele (teste unitário de cookieSeguro).
    expect(setCookie).not.toMatch(/Secure/i)
  })

  test('sem violações graves de acessibilidade', async ({ page }) => {
    await page.goto('/')
    await esperarSemViolacoesGraves(page)
  })
})
