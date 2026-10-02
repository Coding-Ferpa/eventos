import { expect, test } from '@playwright/test'

import {
  apagarEventoComCertificados,
  criarEventoComCertificados,
  type EventoLiberado,
} from './support/banco'
import { CONTAS, entrar, esperarHidratacao } from './support/sessao'

/**
 * E21 do doc 11, no build de produção: a liberação recusa com a lista do que
 * falta, libera quando está tudo certo, e a página pública, que já estava em
 * cache (ISR), passa a mostrar a busca. Depende do seed (`pnpm db:reset`).
 */

const PREFIXO = 'E2E liberação'
let evento: EventoLiberado

test.beforeAll(async () => {
  evento = await criarEventoComCertificados(PREFIXO, { liberado: false })
})

test.afterAll(async () => {
  await apagarEventoComCertificados(evento.id)
})

test('liberação: falha com o que falta; com tudo certo, a busca aparece (E21)', async ({
  page,
}) => {
  // A página pública entra no cache antes, como num evento de verdade.
  await page.goto(`/eventos/${evento.slug}`)
  await expect(page.getByText('Os certificados estão sendo preparados')).toBeVisible()

  await entrar(page, CONTAS.editor)
  await page.goto(`/admin/eventos/${evento.id}`)
  await esperarHidratacao(page)
  const resumo = page.getByRole('region', { name: 'Certificados' })
  await expect(
    resumo.locator('div').filter({ hasText: /^Certificados ativos3$/ }),
  ).toBeVisible()

  const liberar = async () => {
    await resumo.getByRole('button', { name: 'Liberar certificados' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Liberar certificados' })
      .click()
  }

  await liberar()
  const pendencias = resumo.getByRole('alert')
  await expect(pendencias).toContainText('Ainda não dá para liberar os certificados.')
  await expect(pendencias.getByRole('listitem')).toHaveText([
    'Com os certificados no ar, a busca precisa de ao menos uma chave: CPF, e-mail ou nome.',
  ])

  const busca = page.getByRole('region', { name: 'Busca' })
  await busca.getByRole('checkbox', { name: 'CPF' }).check()
  await busca.getByRole('button', { name: 'Salvar busca' }).click()
  await expect(busca.getByRole('status')).toHaveText('Busca salva.')

  // Salvar a busca derrubou o cache da página pública; ela volta a ele antes
  // da liberação, para só a liberação poder tirá-la de lá.
  const publica = await page.context().newPage()
  await publica.goto(`/eventos/${evento.slug}`)
  await expect(publica.getByText('Os certificados estão sendo preparados')).toBeVisible()
  await publica.close()

  await liberar()
  await expect(resumo.getByRole('status')).toHaveText(
    'Certificados no ar. 3 certificados emitidos agora.',
  )
  await expect(resumo.getByText(/Os certificados estão no ar desde \d+ de/)).toBeVisible()
  await expect(resumo.locator('div').filter({ hasText: /^Emitidos3$/ })).toBeVisible()

  await page.goto(`/eventos/${evento.slug}`)
  await expect(page.getByText('Os certificados já estão no ar.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Buscar meu certificado' })).toBeVisible()
})
