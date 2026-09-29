import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { artes } from '../tests/support/artes'
import { apagarEventosComPrefixo, apagarFonteEnviada } from './support/banco'
import { CONTAS, entrar, esperarHidratacao } from './support/sessao'

/**
 * E07 do doc 11: subir a arte, declarar um campo de conteúdo, posicionar
 * nome, código e QR por números, ver a prévia mudar, testar o nome mais
 * longo, publicar; e modelo sem nome não publica. Só no desktop: o editor
 * mostra um aviso abaixo de 1024 px (doc 09).
 */

const NOME_CANONICO = 'Maria Eduarda dos Santos Albuquerque Pessoa Rodrigues'

test.describe.configure({ mode: 'serial' })

/**
 * O spec roda no Chromium e no Safari desktop (doc 11). Cada projeto tem o
 * seu prefixo de evento e a sua fonte: a limpeza de um não apaga o que o
 * outro está usando, e o sha256 da fonte, que é único no banco, não colide.
 */
const POR_PROJETO: Record<string, { prefixo: string; arquivo: string; opcao: string }> = {
  chromium: {
    prefixo: 'E2E modelos chromium',
    arquivo: 'Poppins-Bold.ttf',
    opcao: 'Poppins 700 (enviada)',
  },
  'desktop-safari': {
    prefixo: 'E2E modelos safari',
    arquivo: 'Inter-Bold.ttf',
    opcao: 'Inter 700 (enviada)',
  },
}

function doProjeto(projeto: string) {
  const dados = POR_PROJETO[projeto]
  if (!dados) throw new Error(`Projeto sem dados no spec do editor: ${projeto}`)
  // Uma fonte de verdade, enviada como se fosse da organização.
  const fonte = readFileSync(`public/fonts/cert/${dados.arquivo}`)
  return { ...dados, fonte, sha: createHash('sha256').update(fonte).digest('hex') }
}

// Antes também: a fonte precisa entrar como nova, para o teste ver o
// resultado da ida e volta do subset, e não o "já tinha sido enviada".
test.beforeAll(async () => {
  await apagarFonteEnviada(doProjeto(test.info().project.name).sha)
})

test.afterAll(async () => {
  const { prefixo, sha } = doProjeto(test.info().project.name)
  await apagarEventosComPrefixo(prefixo)
  await apagarFonteEnviada(sha)
})

async function criarEvento(page: Page) {
  const nome = `${doProjeto(test.info().project.name).prefixo} ${Date.now()}`
  await page.goto('/admin/eventos/novo')
  await esperarHidratacao(page)
  await page.getByLabel('Título').fill(nome)
  await page.getByLabel('Início').fill('2027-05-20T19:00')
  await page.getByRole('button', { name: 'Criar evento' }).click()
  await expect(page).toHaveURL(/\/admin\/eventos\/[0-9a-f-]{36}$/)
  return page.url()
}

async function criarModelo(page: Page, urlDoEvento: string, nome: string) {
  await page.goto(urlDoEvento)
  await esperarHidratacao(page)
  await page.getByLabel('Nome do modelo novo').fill(nome)
  await page.getByRole('button', { name: 'Criar modelo' }).click()
  await expect(page).toHaveURL(/\/modelos\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: nome })).toBeVisible()
}

async function subirArte(page: Page) {
  await page.locator('input[type="file"][accept^="application/pdf"]').setInputFiles({
    name: 'arte.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await artes.a4Paisagem()),
  })
  await expect(page.getByText('Arte conferida e salva.')).toBeVisible({ timeout: 30_000 })
}

function linhaDoNome(page: Page) {
  return page.getByTestId('previa-do-modelo').locator('g[data-field="nome"] > g').first()
}

test.describe('modelo por formulário (E07)', () => {
  test('da arte à publicação, com a prévia acompanhando cada número', async ({
    page,
  }, testInfo) => {
    await entrar(page, CONTAS.editor)
    const urlDoEvento = await criarEvento(page)
    await criarModelo(page, urlDoEvento, 'Participante E2E')

    await expect(page.getByText('Envie a arte para ver a prévia.')).toBeVisible()
    await subirArte(page)

    // Campo de conteúdo: a chave nasce do rótulo.
    await page.getByRole('button', { name: 'Declarar campo de conteúdo' }).click()
    await page.getByLabel('Rótulo').fill('Título da palestra')
    await expect(page.getByLabel('Chave')).toHaveValue('titulo_palestra')

    await page.getByRole('button', { name: 'Posicionar o nome' }).click()
    await page.getByRole('button', { name: 'Posicionar o código' }).click()
    await page.getByRole('button', { name: 'Posicionar o QR' }).click()

    // A prévia é o motor no navegador: a linha do nome está no plano.
    await expect(linhaDoNome(page)).toHaveAttribute('transform', /translate/)
    const antes = await linhaDoNome(page).getAttribute('transform')

    // Mover a caixa do nome por número move a linha na prévia.
    await page.getByRole('group', { name: 'Texto: nome' }).getByLabel('Topo').fill('25')
    await expect.poll(() => linhaDoNome(page).getAttribute('transform')).not.toBe(antes)

    // Sem participantes, o nome mais longo é o canônico do doc 05.
    await page
      .getByRole('button', { name: 'Testar com o nome mais longo deste evento' })
      .click()
    await expect(page.getByLabel('Nome de exemplo')).toHaveValue(NOME_CANONICO)
    await expect(page.getByTestId('previa-do-modelo').locator('svg')).toHaveAttribute(
      'aria-label',
      `Prévia do certificado de ${NOME_CANONICO}`,
    )
    await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true })

    await page.getByRole('button', { name: 'Salvar rascunho' }).click()
    await expect(
      page.getByText('Rascunho salvo. Os downloads não mudam até publicar.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Publicar' }).click()
    await expect(
      page.getByText('Modelo publicado: os próximos PDFs já saem com ele.'),
    ).toBeVisible()
    await expect(page.getByText('Publicado, versão 1')).toBeVisible()

    // O tipo de participação passa a usar o modelo.
    await page.goto(urlDoEvento)
    await esperarHidratacao(page)
    await page
      .getByRole('combobox', { name: 'Modelo de certificado de Participante' })
      .click()
    await page.getByRole('option', { name: 'Participante E2E' }).click()
    const seletor = page.getByRole('combobox', {
      name: 'Modelo de certificado de Participante',
    })
    // O seletor mostra o modelo depois que a action grava e a página recarrega os dados.
    await expect(seletor).toHaveText('Participante E2E')
    await page.reload()
    await expect(seletor).toHaveText('Participante E2E')
  })

  test('modelo sem o nome do participante não publica', async ({ page }) => {
    await entrar(page, CONTAS.editor)
    const urlDoEvento = await criarEvento(page)
    await criarModelo(page, urlDoEvento, 'Sem nome E2E')
    await subirArte(page)

    await page.getByRole('button', { name: 'Posicionar o código' }).click()
    await page.getByRole('button', { name: 'Posicionar o QR' }).click()
    await page.getByRole('button', { name: 'Salvar rascunho' }).click()
    await expect(
      page.getByText('Rascunho salvo. Os downloads não mudam até publicar.'),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Publicar' }).click()
    await expect(page.getByText('O modelo ainda não pode ser publicado.')).toBeVisible()
    await expect(
      page.getByText('Falta um campo de texto com {{participant.full_name}}.'),
    ).toBeVisible()
    await expect(page.getByText('Rascunho', { exact: true })).toBeVisible()
  })

  test('fonte enviada entra no seletor e a prévia a usa, lida do bucket privado', async ({
    page,
  }) => {
    await entrar(page, CONTAS.editor)
    const urlDoEvento = await criarEvento(page)
    await criarModelo(page, urlDoEvento, 'Fonte E2E')
    await subirArte(page)

    // O servidor avalia a fonte com o pdf.js (ida e volta do subset). A
    // Poppins passa: "falhou no subset" aqui seria o pdf.js quebrado no build
    // de produção, que marcava toda fonte assim sem erro nenhum (M6).
    await page.locator('input[type="file"][accept=".ttf,.otf"]').setInputFiles({
      name: 'Marca-Bold.ttf',
      mimeType: 'font/ttf',
      buffer: doProjeto(test.info().project.name).fonte,
    })
    await expect(page.getByText('Fonte conferida e disponível.')).toBeVisible({
      timeout: 30_000,
    })

    await page.getByRole('button', { name: 'Posicionar o nome' }).click()
    const nome = page.getByRole('group', { name: 'Texto: nome' })
    await nome.getByRole('combobox', { name: 'Fonte' }).click()
    await page
      .getByRole('option', { name: doProjeto(test.info().project.name).opcao })
      .click()

    await expect(linhaDoNome(page)).toHaveAttribute('transform', /translate/)
    // Os glifos da prévia vêm da fonte enviada: o id nasce da referência dela.
    await expect(
      page
        .getByTestId('previa-do-modelo')
        .locator('defs > path[id^="cf-custom-"]')
        .first(),
    ).toBeAttached()
    // No main: o anunciador de rota do Next também é role=alert.
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
  })
})
