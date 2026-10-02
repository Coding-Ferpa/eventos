import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { esperarSemViolacoesGraves } from './support/axe'
import {
  apagarEventosComCertificados,
  criarEventoParaImportacao,
  liberarComDownload,
} from './support/banco'
import { CONTAS, entrar, esperarHidratacao } from './support/sessao'

/**
 * E08, E09, E10 e E20 do doc 11, no build de produção (o webServer roda
 * `pnpm build && pnpm start`): a planilha sobe pela Server Action de verdade,
 * com o limite de corpo de verdade. Depende do seed (`pnpm db:reset`).
 */

const PREFIXO = 'E2E importação'
const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures/csv')

test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  await apagarEventosComCertificados(PREFIXO)
})

let eventoId: string

test.beforeAll(async () => {
  eventoId = await criarEventoParaImportacao(`${PREFIXO} ${Date.now()}`)
})

async function abrirImportacao(page: Page) {
  await page.goto(`/admin/eventos/${eventoId}/importar`)
  await esperarHidratacao(page)
  await page.getByRole('radio', { name: 'Participante' }).check()
}

type ArquivoEmMemoria = { name: string; mimeType: string; buffer: Buffer }

async function enviar(page: Page, arquivo: string | ArquivoEmMemoria) {
  await page
    .locator('input[type="file"]')
    .setInputFiles(typeof arquivo === 'string' ? path.join(FIXTURES, arquivo) : arquivo)
  await expect(page.getByRole('heading', { name: '2. Que coluna é o quê' })).toBeVisible()
}

async function verPrevia(page: Page) {
  await page.getByRole('button', { name: 'Ver a prévia' }).click()
  await expect(page.getByRole('heading', { name: '3. Prévia' })).toBeVisible()
}

/** O número de um contador do resumo: o `dd` logo depois do `dt` com o rótulo. */
function contador(page: Page, rotulo: string) {
  return page
    .getByRole('term')
    .filter({ hasText: new RegExp('^' + rotulo + '$') })
    .locator('xpath=following-sibling::dd[1]')
}

test('E08: a planilha do Excel pt-BR, da inspeção à lista de participantes', async ({
  page,
}) => {
  await entrar(page, CONTAS.editor)
  await abrirImportacao(page)
  await esperarSemViolacoesGraves(page)
  await enviar(page, 'excel-ptbr-cp1252-semicolon.csv')
  await esperarSemViolacoesGraves(page)

  // Os acentos já decodificados, antes de qualquer coisa ir para o banco.
  const amostra = page.getByRole('table')
  await expect(amostra.getByText('José Gonçalves de Assunção')).toBeVisible()
  await expect(amostra.getByText('Ângela Muñoz Ñandú')).toBeVisible()
  await expect(
    page.getByText(
      /Codificação: Windows \(Excel em português\) · Separador: ponto e vírgula · \d+ linhas/,
    ),
  ).toBeVisible()
  await expect(page.getByLabel(/Nome completo/)).toHaveValue('Nome completo')
  await expect(page.getByLabel(/^CPF/)).toHaveValue('CPF')

  // O stepper do doc 03 (6f), e de onde veio a sugestão.
  const etapas = page
    .getByRole('list', { name: 'Etapas da importação' })
    .getByRole('listitem')
  await expect(etapas.nth(1)).toHaveAttribute('aria-current', 'step')
  await expect(etapas.nth(0)).toContainText('(concluída)')
  await expect(page.getByText('Sugestão pela semelhança dos cabeçalhos.')).toBeVisible()
  // O CPF chega ao navegador mascarado, na amostra e no exemplo (doc 06).
  await expect(page.getByText('Exemplo: ***.***.**7-25')).toBeVisible()
  await expect(amostra.getByText('***.***.**7-25')).toBeVisible()
  await expect(amostra.getByText(/\d{3}\.\d{3}\.\d{3}-\d{2}/)).toHaveCount(0)

  await verPrevia(page)
  await expect(contador(page, 'A criar')).toHaveText('7')
  await expect(page.getByText('7 pessoas novas')).toBeVisible()
  await esperarSemViolacoesGraves(page)
  await page.screenshot({ fullPage: true, path: 'test-results/importacao-previa.png' })

  await page.getByRole('button', { name: 'Aplicar a importação' }).click()
  await expect(
    page.getByRole('heading', { name: '4. Importação aplicada' }),
  ).toBeVisible()
  await expect(
    page.getByText('7 certificados criados e 0 atualizados, com 7 pessoas novas.'),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Ver os participantes' }).click()
  await esperarHidratacao(page)
  for (const nome of [
    'José Gonçalves de Assunção',
    'Ana-Clara D’Ávila',
    'Luís Antônio Gonçalves',
  ]) {
    await expect(page.getByRole('cell', { name: nome, exact: true })).toBeVisible()
  }
  await esperarSemViolacoesGraves(page)
})

test('E09: o mesmo arquivo não muda nada; o nome corrigido vira atualização com o antes e o depois', async ({
  page,
}) => {
  await entrar(page, CONTAS.editor)
  await abrirImportacao(page)
  await enviar(page, 'excel-ptbr-cp1252-semicolon.csv')
  await expect(page.getByText(/Este mesmo arquivo já foi aplicado em/)).toBeVisible()
  // A primeira importação gravou o mapeamento no modelo.
  await expect(page.getByText(/^Mapeamento do modelo aplicado/)).toBeVisible()
  await verPrevia(page)
  await expect(contador(page, 'A criar')).toHaveText('0')
  await expect(contador(page, 'A atualizar')).toHaveText('0')
  await expect(page.getByRole('button', { name: 'Aplicar a importação' })).toBeDisabled()
  await page.getByRole('button', { name: 'Descartar' }).click()

  await page.getByRole('radio', { name: 'Participante' }).check()
  await enviar(page, 'reimport-name-fixed.csv')
  await verPrevia(page)
  await expect(contador(page, 'A atualizar')).toHaveText('1')
  await page.getByRole('button', { name: 'A atualizar', exact: true }).click()
  const linha = page
    .getByRole('listitem')
    .filter({ hasText: 'Conceição Araújo Lima Souza' })
  await expect(linha.getByText('Conceição Araújo Lima', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Aplicar a importação' }).click()
  await expect(page.getByText(/0 certificados criados e 1 atualizado/)).toBeVisible()
})

test('E10: CPF inválido aparece com a linha e o motivo; a possível duplicata bloqueia até decidir', async ({
  page,
}) => {
  const csv =
    'Nome completo;CPF;E-mail\r\n' +
    'Pessoa Com Cpf Errado;529.982.247-24;\r\n' +
    'Pessoa Nova Valida;864.213.579-46;\r\n' +
    // Mesmo e-mail da Maria Eduarda, que entrou no E08, com outro nome.
    'Maria E. Albuquerque;;maria.eduarda@exemplo.org\r\n'
  await entrar(page, CONTAS.editor)
  await abrirImportacao(page)
  await enviar(page, {
    name: 'erros.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  })
  await verPrevia(page)

  await expect(contador(page, 'Com erro')).toHaveText('1')
  await expect(contador(page, 'Pedem decisão')).toHaveText('1')
  await expect(page.getByRole('button', { name: 'Aplicar a importação' })).toBeDisabled()

  // A tela abre no filtro do que pede decisão.
  const duvida = page.getByRole('listitem').filter({ hasText: 'Maria E. Albuquerque' })
  await expect(duvida.getByText('Já no evento')).toBeVisible()
  await expect(duvida.getByText('Maria Eduarda dos Santos Albuquerque')).toBeVisible()
  await duvida.getByRole('button', { name: 'É outra pessoa' }).click()
  await expect(contador(page, 'Pedem decisão')).toHaveText('0')

  await page.getByRole('button', { name: 'Com erro', exact: true }).click()
  const erro = page.getByRole('listitem').filter({ hasText: 'Linha 2' })
  await expect(
    erro.getByText('CPF inválido: os dígitos verificadores não conferem.'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Aplicar a importação' }).click()
  await expect(page.getByText(/2 certificados criados/)).toBeVisible()
})

test('a planilha de quase 2 MB passa pelo limite de corpo da Server Action', async ({
  page,
}) => {
  const recheio = 'x'.repeat(380)
  let csv = 'Nome completo;Observação\r\n'
  for (let i = 1; i <= 4_900; i++) csv += `Participante Numero ${i} Teste;${recheio}\r\n`
  const buffer = Buffer.from(csv, 'utf8')
  expect(buffer.byteLength).toBeGreaterThan(1_900_000)
  expect(buffer.byteLength).toBeLessThan(2 * 1024 * 1024)

  await entrar(page, CONTAS.editor)
  await abrirImportacao(page)
  await enviar(page, { name: 'grande.csv', mimeType: 'text/csv', buffer })
  await expect(
    page.getByText(/grande\.csv\. Codificação: .+ · 4900 linhas/),
  ).toBeVisible()
})

test('E20: antes da liberação remove; depois, com download, recusa e oferece revogar', async ({
  page,
}) => {
  await entrar(page, CONTAS.editor)
  await page.goto(`/admin/eventos/${eventoId}/participantes`)
  await esperarHidratacao(page)

  await page.getByRole('checkbox', { name: /Selecionar Pessoa Nova Valida/ }).check()
  await page.getByRole('checkbox', { name: /Selecionar Maria E\. Albuquerque/ }).check()
  await page.getByRole('button', { name: 'Remover selecionados (2)' }).click()
  await page.getByLabel('Quantidade').fill('2')
  await page.getByRole('button', { name: 'Remover', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: 'Pessoa Nova Valida', exact: true }),
  ).toHaveCount(0)

  await liberarComDownload(eventoId, 'João Pedro da Silva')
  // Outra conta: sem limpar a sessão do editor, o /login redireciona direto.
  await page.context().clearCookies()
  await entrar(page, CONTAS.admin)
  await page.goto(`/admin/eventos/${eventoId}/participantes`)
  await esperarHidratacao(page)
  await page.getByRole('checkbox', { name: /Selecionar João Pedro da Silva/ }).check()
  await page.getByRole('button', { name: 'Remover selecionados (1)' }).click()
  await page.getByLabel('Quantidade').fill('1')
  await page.getByRole('button', { name: 'Remover', exact: true }).click()
  // O anunciador de rotas do Next também é um role=alert: filtra pelo texto.
  await expect(
    page.getByRole('alert').filter({ hasText: 'em vez de remover, revogue' }),
  ).toBeVisible()

  const linha = page.getByRole('row').filter({ hasText: 'João Pedro da Silva' })
  await expect(linha.getByText('Pede revogação')).toBeVisible()
  await linha.getByRole('button', { name: 'Revogar' }).click()
  await page.getByLabel('Motivo').fill('Certificado emitido por engano')
  await page.getByRole('button', { name: 'Revogar', exact: true }).last().click()
  await expect(linha.getByText('Revogado')).toBeVisible()
})
