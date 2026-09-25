import { expect, test, type Page } from '@playwright/test'

import { apagarEventosComPrefixo } from './support/banco'
import { CONTAS, entrar } from './support/sessao'

/**
 * E06 do doc 11: criar, editar e mudar o status de um evento; os quatro tipos
 * padrão existem; publicado, ele aparece no catálogo na mesma navegação
 * (DoD do M4). Depende do seed de desenvolvimento (`pnpm db:reset`).
 */

const PREFIXO = 'E2E admin'

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  await apagarEventosComPrefixo(PREFIXO)
})

function titulo(sufixo: string) {
  return `${PREFIXO} ${sufixo} ${Date.now()}`
}

async function escolher(page: Page, campo: string, opcao: string) {
  await page.getByRole('combobox', { name: campo }).click()
  await page.getByRole('option', { name: opcao, exact: true }).click()
}

async function criarEvento(page: Page, nome: string) {
  await page.goto('/admin/eventos')
  await page.getByRole('link', { name: 'Novo evento' }).click()
  await expect(page.getByRole('heading', { name: 'Novo evento' })).toBeVisible()

  await page.getByLabel('Título').fill(nome)
  await page.getByLabel('Início').fill('2027-05-20T19:00')
  await page.getByLabel('Cidade').fill('Fernandópolis')
  await escolher(page, 'UF', 'SP')
  await page.getByRole('button', { name: 'Criar evento' }).click()

  await expect(page).toHaveURL(/\/admin\/eventos\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
}

test.describe('admin de eventos (E06)', () => {
  test('editor cria um evento em rascunho, com os quatro tipos padrão', async ({
    page,
  }) => {
    const nome = titulo('criação')
    await entrar(page, CONTAS.editor)
    await criarEvento(page, nome)

    await expect(page.getByText('Em rascunho: fora do catálogo')).toBeVisible()
    const tipos = page.getByRole('region', { name: 'Tipos de participação' })
    for (const tipo of ['Participante', 'Palestrante', 'Organizador', 'Monitor']) {
      await expect(tipos.getByText(tipo, { exact: true })).toBeVisible()
    }
    await expect(tipos.getByText('Carga horária a definir')).toHaveCount(4)

    await page.screenshot({ fullPage: true, path: 'test-results/admin-evento-novo.png' })
  })

  test('publicar faz o evento aparecer no catálogo na mesma navegação', async ({
    page,
  }) => {
    const nome = titulo('publicação')
    await entrar(page, CONTAS.editor)
    await criarEvento(page, nome)

    await escolher(page, 'Status', 'Inscrições abertas')
    await page.getByRole('button', { name: 'Mudar status' }).click()
    await expect(page.getByText('Status alterado.')).toBeVisible()

    await page.goto('/')
    await expect(
      page.getByRole('region', { name: 'Eventos' }).getByRole('heading', { name: nome }),
    ).toBeVisible()
  })

  test('editar os dados, a busca e um tipo', async ({ page }) => {
    const nome = titulo('edição')
    await entrar(page, CONTAS.editor)
    await criarEvento(page, nome)

    const dados = page.getByRole('region', { name: 'Dados' })
    await dados.getByLabel('Cidade').fill('Jales')
    await dados.getByLabel('Descrição').fill('## Programação\n\n- Abertura')
    await dados.getByRole('button', { name: 'Salvar dados' }).click()
    await expect(dados.getByText('Dados salvos.')).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('region', { name: 'Dados' }).getByLabel('Cidade'),
    ).toHaveValue('Jales')

    // A data de nascimento sozinha não vira chave (ADR-0009).
    const busca = page.getByRole('region', { name: 'Busca' })
    await busca.getByLabel('Pedir também a data de nascimento').check()
    await busca.getByRole('button', { name: 'Salvar busca' }).click()
    await expect(
      busca.getByText('nunca é chave sozinha', { exact: false }).last(),
    ).toBeVisible()

    await busca.getByLabel('Nome completo').check()
    await busca.getByRole('button', { name: 'Salvar busca' }).click()
    await expect(busca.getByText('Busca salva.')).toBeVisible()

    const tipos = page.getByRole('region', { name: 'Tipos de participação' })
    await tipos.getByRole('button', { name: 'Editar' }).first().click()
    await tipos.getByLabel('Carga horária padrão').fill('4')
    await tipos.getByRole('button', { name: 'Salvar tipo' }).click()
    await expect(tipos.getByText('4 h por padrão')).toBeVisible()
  })

  test('capa enviada aparece no lugar da gerada', async ({ page }) => {
    const nome = titulo('capa')
    await entrar(page, CONTAS.editor)
    await criarEvento(page, nome)

    const capa = page.getByRole('region', { name: 'Capa' })
    await capa
      .getByLabel('Enviar uma capa')
      .setInputFiles('tests/fixtures/imagens/capa-16x9.png')
    await expect(capa.getByText('Capa atualizada.')).toBeVisible()
    await expect(capa.getByRole('img', { name: 'Capa enviada' })).toBeVisible()
    await expect(
      capa.getByRole('button', { name: 'Voltar para a capa gerada' }),
    ).toBeVisible()

    // Publicado, a página pública serve a capa do Storage pelo otimizador do
    // next/image, que precisa do endereço do Supabase liberado no next.config.
    await escolher(page, 'Status', 'Inscrições abertas')
    await page.getByRole('button', { name: 'Mudar status' }).click()
    await expect(page.getByText('Status alterado.')).toBeVisible()

    const endereco = await page
      .getByRole('link', { name: /Ver a página pública/ })
      .getAttribute('href')
    await page.goto(endereco ?? '/')
    const imagem = page.locator('article img').first()
    await expect(imagem).toHaveAttribute('src', /_next\/image\?url=.*covers/)
    await expect
      .poll(() => imagem.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0)
  })

  test('apagar é do admin, e só em rascunho', async ({ page }) => {
    const nome = titulo('remoção')
    await entrar(page, CONTAS.editor)
    await criarEvento(page, nome)
    const endereco = page.url()
    await expect(page.getByRole('region', { name: 'Apagar' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL('/')
    await entrar(page, CONTAS.admin)
    await page.goto(endereco)

    await page.getByRole('button', { name: 'Apagar evento' }).click()
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Apagar evento' })
      .click()
    await expect(page).toHaveURL('/admin/eventos')
    await expect(page.getByText(nome)).toHaveCount(0)
  })
})
