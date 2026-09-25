import { expect, test, type Page } from '@playwright/test'

/**
 * E05 do doc 11: quem não tem papel suficiente não entra no admin, e o editor
 * não vê a gestão de usuários. Depende do Supabase local com o seed de
 * desenvolvimento aplicado (`pnpm db:reset`).
 */

const SENHA = 'cfeventos-local'
const ADMIN = 'admin@cfeventos.local'
const EDITOR = 'editor@cfeventos.local'
const READER = 'reader@cfeventos.local'

async function entrar(page: Page, email: string, senha = SENHA) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

test.describe('autorização do admin', () => {
  test('visitante sem sessão é levado ao login, com o destino preservado', async ({
    page,
  }) => {
    await page.goto('/admin/usuarios')

    await expect(page).toHaveURL(/\/login\?proximo=%2Fadmin%2Fusuarios/)
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible()
  })

  test('editor entra e alcança o painel', async ({ page }) => {
    await entrar(page, EDITOR)

    await expect(page).toHaveURL('/admin')
    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible()
    await expect(page.getByText(EDITOR)).toBeVisible()
  })

  test('editor não vê a gestão de usuários, nem pelo menu nem pelo endereço', async ({
    page,
  }) => {
    await entrar(page, EDITOR)
    await expect(page).toHaveURL('/admin')

    const menu = page.getByRole('navigation', { name: 'Administração' })
    await expect(menu.getByRole('link', { name: 'Usuários' })).toHaveCount(0)

    await page.goto('/admin/usuarios')
    await expect(page).toHaveURL('/')
  })

  test('admin vê a gestão de usuários, com as três contas do seed', async ({ page }) => {
    await entrar(page, ADMIN)
    await expect(page).toHaveURL('/admin')

    await page
      .getByRole('navigation', { name: 'Administração' })
      .getByRole('link', { name: 'Usuários' })
      .click()

    await expect(page.getByRole('heading', { name: 'Usuários' })).toBeVisible()
    for (const email of [ADMIN, EDITOR, READER]) {
      await expect(page.getByRole('cell', { name: email })).toBeVisible()
    }
  })

  test('conta sem papel entra, mas não alcança o painel', async ({ page }) => {
    await entrar(page, READER)

    // Tem sessão, então não volta para o login: o guarda de papel manda para
    // a área pública.
    await expect(page).toHaveURL('/')
    await expect(
      page.getByRole('heading', { name: 'Seu certificado, na hora.' }),
    ).toBeVisible()
  })

  test('sair encerra a sessão', async ({ page }) => {
    await entrar(page, EDITOR)
    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible()

    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL('/')

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('credenciais erradas não revelam se o e-mail existe', async ({ page }) => {
    await entrar(page, ADMIN, 'senha-errada-mesmo')

    await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('sem credenciais de OAuth, o login não oferece o GitHub', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('button', { name: /GitHub/ })).toHaveCount(0)
  })
})
