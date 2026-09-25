import { expect, test } from '@playwright/test'

import { esperarSemViolacoesGraves } from '../support/axe'

/** O formulário de `/validar` (M3). O resultado, `/validar/[codigo]`, é do M8. */

test('normaliza o código e navega para a página dele', async ({ page }) => {
  await page.goto('/validar')

  await page.getByLabel('Código de validação').fill('dem0 cf2 026')
  await page.getByRole('button', { name: 'Validar' }).click()

  await expect(page).toHaveURL('/validar/DEM0CF2026')
})

test('explica o erro sem sair da página', async ({ page }) => {
  await page.goto('/validar')

  await page.getByLabel('Código de validação').fill('7K2M9QF')
  await page.getByRole('button', { name: 'Validar' }).click()

  // O anunciador de rotas do Next também é um `alert`: a busca fica no `main`.
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    'O código tem 10 caracteres. Faltam 3.',
  )
  await expect(page).toHaveURL('/validar')
})

test('sem violações graves de acessibilidade', async ({ page }) => {
  await page.goto('/validar')
  await esperarSemViolacoesGraves(page)
})
