import { expect, test, type Page } from '@playwright/test'

/**
 * E03 do doc 11: escuro por padrão, a escolha persiste no cookie `cf-tema`, e
 * o tema certo já está aplicado na primeira pintura.
 *
 * "Primeira pintura" aqui é verificável: um `requestAnimationFrame` agendado
 * antes de qualquer script da página roda logo antes do primeiro quadro. Se o
 * `data-theme` ainda não estiver lá nesse momento, a pessoa viu o tema errado.
 */

// A regra do doc 03 é "escuro, a menos que o sistema peça claro". O
// Playwright emula o sistema claro por padrão, e navegador nenhum reporta mais
// "sem preferência" (o Chromium responde claro), então o padrão do produto se
// testa com o sistema escuro. O caso do sistema claro tem teste próprio.
test.use({ colorScheme: 'dark' })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    requestAnimationFrame(() => {
      document.documentElement.dataset.temaNaPrimeiraPintura =
        document.documentElement.dataset.theme ?? 'nenhum'
    })
  })
})

function temaNaPrimeiraPintura(page: Page) {
  return page.evaluate(() => document.documentElement.dataset.temaNaPrimeiraPintura)
}

test('escuro por padrão, já na primeira pintura (E03)', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await temaNaPrimeiraPintura(page)).toBe('dark')
})

test('alternar grava o cookie e sobrevive ao recarregar, sem piscar (E03)', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Mudar para o tema claro' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const cookie = (await context.cookies()).find(({ name }) => name === 'cf-tema')
  expect(cookie?.value).toBe('light')

  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await temaNaPrimeiraPintura(page)).toBe('light')
  await expect(
    page.getByRole('button', { name: 'Mudar para o tema escuro' }),
  ).toBeVisible()
})

test.describe('sistema claro', () => {
  test.use({ colorScheme: 'light' })

  test('sem escolha salva, segue o sistema, já na primeira pintura', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await temaNaPrimeiraPintura(page)).toBe('light')
  })
})
