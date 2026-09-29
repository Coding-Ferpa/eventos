import type { Page } from '@playwright/test'

/**
 * Contas do seed de desenvolvimento (`supabase/seeds/02-dev.sql`), que só
 * existem em local e no CI. Quem digita a senha é o teste, e não uma pessoa.
 */
export const SENHA_DE_SEED = 'cfeventos-local'

export const CONTAS = {
  admin: 'admin@cfeventos.local',
  editor: 'editor@cfeventos.local',
  reader: 'reader@cfeventos.local',
} as const

export async function entrar(page: Page, email: string, senha = SENHA_DE_SEED) {
  await page.goto('/login')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  // O login termina com um redirecionamento; navegar antes dele chegaria sem
  // o cookie de sessão e cairia de novo no login.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

/**
 * Espera o admin hidratar (a marca do `MarcaDeHidratacao`). Depois de um
 * `goto`, digitar antes disso perde o texto nos campos controlados, e no
 * WebKit isso acontece de verdade (M6).
 */
export async function esperarHidratacao(page: Page) {
  await page.locator('html[data-hidratado]').waitFor({ state: 'attached' })
}
